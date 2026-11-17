"""Free model providers (Groq free tier, local Ollama) behind one router with fallback.

Every call asks for JSON and validates it against a Pydantic model; invalid output is retried
once with the validation error, then the next provider is tried.
"""

import json
import re
import time
from typing import Callable, Optional, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import Settings

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """No provider could produce a valid answer."""


class RateLimited(Exception):
    def __init__(self, retry_after: float):
        super().__init__(f"rate limited, retry after {retry_after}s")
        self.retry_after = retry_after


class ProviderUnavailable(Exception):
    """Provider is down, unreachable, or misconfigured; skip to the next one."""


class Provider(Protocol):
    name: str
    model: str

    def available(self) -> bool: ...

    def chat(self, system: str, user: str) -> str: ...


class GroqProvider:
    name = "groq"
    URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str, timeout: float = 60):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.api_key)

    def chat(self, system: str, user: str) -> str:
        try:
            r = httpx.post(
                self.URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as e:
            raise ProviderUnavailable(f"groq unreachable: {e}") from e
        if r.status_code == 429:
            raise RateLimited(_retry_after(r.headers.get("retry-after")))
        if r.status_code >= 500 or r.status_code in (401, 403, 404):
            raise ProviderUnavailable(f"groq HTTP {r.status_code}: {r.text[:200]}")
        if r.status_code >= 400:
            # e.g. JSON-mode generation failure; treat like invalid output so we retry
            return ""
        return r.json()["choices"][0]["message"]["content"] or ""


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout: float = 300):
        self.base_url = base_url
        self.model = model
        self.timeout = timeout

    def available(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=2)
            models = [m.get("name", "") for m in r.json().get("models", [])]
            return any(m == self.model or m.split(":")[0] == self.model for m in models)
        except (httpx.HTTPError, ValueError):
            return False

    def chat(self, system: str, user: str) -> str:
        try:
            r = httpx.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.2, "num_ctx": 8192},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as e:
            raise ProviderUnavailable(f"ollama unreachable: {e}") from e
        if r.status_code >= 400:
            raise ProviderUnavailable(f"ollama HTTP {r.status_code}: {r.text[:200]}")
        return r.json().get("message", {}).get("content", "")


def _retry_after(value: Optional[str]) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 30.0


def parse_json(text: str) -> dict:
    """Parse a JSON object from model output, tolerating code fences or stray prose."""
    text = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object in model output")
        data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("model output is not a JSON object")
    return data


class LLMRouter:
    """Tries providers in order. Waits briefly on short rate limits, otherwise falls back."""

    MAX_WAIT = 30.0  # free-tier token-per-minute limits usually clear within this; the local fallback is far slower

    def __init__(self, providers: list[Provider], on_event: Optional[Callable[[str, str], None]] = None):
        self.providers = providers
        self.on_event = on_event or (lambda kind, msg: None)
        self.last_provider: Optional[str] = None

    def status(self) -> list[dict]:
        return [{"name": p.name, "model": p.model, "available": p.available()} for p in self.providers]

    def json(self, system: str, user: str, model_cls: type[T]) -> T:
        errors: list[str] = []
        for provider in self.providers:
            if not provider.available():
                errors.append(f"{provider.name}: not configured or not running")
                continue
            prompt = user
            waited = False
            for attempt in range(3):
                try:
                    raw = provider.chat(system, prompt)
                except RateLimited as e:
                    if not waited and e.retry_after <= self.MAX_WAIT:
                        self.on_event("warning", f"{provider.name} rate-limited; waiting {e.retry_after:.0f}s")
                        time.sleep(e.retry_after)
                        waited = True
                        continue
                    self.on_event("warning", f"{provider.name} rate-limited; switching provider")
                    errors.append(f"{provider.name}: rate limited")
                    break
                except ProviderUnavailable as e:
                    self.on_event("warning", f"{provider.name} unavailable; switching provider")
                    errors.append(str(e))
                    break
                try:
                    result = model_cls.model_validate(parse_json(raw))
                    self.last_provider = f"{provider.name}:{provider.model}"
                    return result
                except (ValueError, ValidationError) as e:
                    errors.append(f"{provider.name}: invalid output ({str(e)[:150]})")
                    prompt = (
                        user
                        + "\n\nYour previous reply was not valid JSON for the required schema. Error: "
                        + str(e)[:400]
                        + "\nReply again with ONLY a valid JSON object."
                    )
        raise LLMError("All model providers failed: " + " | ".join(errors[-4:]))


def build_router(settings: Settings, on_event=None) -> LLMRouter:
    available = {
        "groq": lambda: GroqProvider(settings.groq_api_key, settings.groq_model),
        "ollama": lambda: OllamaProvider(settings.ollama_url, settings.ollama_model),
    }
    providers = [available[name]() for name in settings.llm_providers if name in available]
    return LLMRouter(providers, on_event)
