"""Free web search (Tavily free tier or DuckDuckGo) and safe page fetching."""

import time
from dataclasses import dataclass
from typing import Optional, Protocol
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from .security import is_safe_url


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str


class SearchError(Exception):
    pass


class SearchProvider(Protocol):
    name: str

    def search(self, query: str, max_results: int) -> list[SearchResult]: ...


class TavilySearch:
    name = "tavily"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def search(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            r = httpx.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"query": query, "max_results": max_results, "search_depth": "basic"},
                timeout=20,
            )
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise SearchError(f"tavily: {e}") from e
        return [
            SearchResult(x.get("title", ""), x.get("url", ""), x.get("content", ""))
            for x in r.json().get("results", [])
            if x.get("url")
        ]


_STOPWORDS = {"the", "a", "an", "of", "in", "for", "and", "to", "on", "by", "with", "among", "is", "are", "will", "that", "their"}


def shorten_query(query: str, max_words: int = 6) -> str:
    """Keyword version of a sentence-like query; free search engines often return nothing for long ones."""
    words = [w for w in query.replace("?", " ").split() if w.lower() not in _STOPWORDS]
    return " ".join(words[:max_words])


class DuckDuckGoSearch:
    """Free metasearch via the unofficial `ddgs` library (no key).

    The upstream engines throttle rapid requests and ddgs reports that as "No results found", so each query is
    retried with backoff, then once more as a shorter keyword query.
    """

    name = "duckduckgo"
    MIN_GAP = 2.0
    BACKOFF = (0.0, 4.0, 8.0)

    def __init__(self, sleep=time.sleep):
        self._last = 0.0
        self._sleep = sleep

    def _once(self, query: str, max_results: int) -> list[dict]:
        from ddgs import DDGS

        wait = self.MIN_GAP - (time.monotonic() - self._last)
        if wait > 0:
            self._sleep(wait)
        try:
            return DDGS().text(query, max_results=max_results) or []
        finally:
            self._last = time.monotonic()

    def search(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            import ddgs  # noqa: F401
        except ImportError as e:
            raise SearchError("ddgs package not installed") from e
        attempts = [(query, d) for d in self.BACKOFF]
        short = shorten_query(query)
        if short and short.lower() != query.lower():
            attempts.append((short, 2.0))
        last_err = None
        for q, delay in attempts:
            if delay:
                self._sleep(delay)
            try:
                rows = self._once(q, max_results)
            except Exception as e:  # ddgs raises several exception types, incl. undocumented rate limits
                last_err = e
                continue
            results = [SearchResult(x.get("title", ""), x.get("href", ""), x.get("body", "")) for x in rows if x.get("href")]
            if results:
                return results
        raise SearchError(f"duckduckgo: {last_err or 'no results'}")


class SearchRouter:
    def __init__(self, providers: list[SearchProvider]):
        self.providers = providers

    @property
    def names(self) -> list[str]:
        return [p.name for p in self.providers]

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        errors = []
        for p in self.providers:
            try:
                results = p.search(query, max_results)
                if results:
                    return results
            except SearchError as e:
                errors.append(str(e))
        if errors:
            raise SearchError("; ".join(errors))
        return []


def build_search(tavily_key: str) -> SearchRouter:
    providers: list[SearchProvider] = []
    if tavily_key:
        providers.append(TavilySearch(tavily_key))
    providers.append(DuckDuckGoSearch())
    return SearchRouter(providers)


class PageFetcher:
    """Fetches a public page and returns its readable text. Checks every redirect hop for safety."""

    MAX_BYTES = 2_000_000
    MAX_CHARS = 20_000

    def fetch(self, url: str) -> Optional[str]:
        current = url
        with httpx.Client(timeout=12, follow_redirects=False, headers={"User-Agent": "PremiseResearchAgent/0.1"}) as c:
            for _ in range(4):
                if not is_safe_url(current):
                    return None
                try:
                    with c.stream("GET", current) as r:
                        if r.is_redirect:
                            current = urljoin(current, r.headers.get("location", ""))
                            continue
                        if r.status_code >= 400:
                            return None
                        ctype = r.headers.get("content-type", "")
                        if "html" not in ctype and "text/plain" not in ctype:
                            return None
                        body = b""
                        for chunk in r.iter_bytes():
                            body += chunk
                            if len(body) > self.MAX_BYTES:
                                break
                        text = body.decode(r.encoding or "utf-8", errors="replace")
                except httpx.HTTPError:
                    return None
                return html_to_text(text)[: self.MAX_CHARS] if "html" in ctype else text[: self.MAX_CHARS]
        return None


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe"]):
        tag.decompose()
    return " ".join(soup.get_text(" ").split())


_WORD = __import__("re").compile(r"[a-zA-Z0-9][a-zA-Z0-9\-']+")


def select_passages(text: str, focus: str, max_chars: int = 2500, window: int = 400) -> str:
    """Keep the parts of a page most related to the assumption, to stay within free-tier token limits.

    Splits the page into overlapping windows, scores each by overlap with the focus keywords, and returns the best
    windows in page order. The full page is still used to verify quotes.
    """
    if len(text) <= max_chars:
        return text
    keys = {w.lower() for w in _WORD.findall(focus) if len(w) > 3 and w.lower() not in _STOPWORDS}
    step = window // 2
    chunks = [(i, text[i : i + window]) for i in range(0, len(text), step)]
    scored = sorted(
        chunks,
        key=lambda c: sum(1 for w in _WORD.findall(c[1].lower()) if w in keys),
        reverse=True,
    )
    picked, total = [], 0
    for i, chunk in scored:
        if total + len(chunk) > max_chars:
            break
        if any(abs(i - j) < window for j, _ in picked):
            continue  # skip windows that overlap one already taken
        picked.append((i, chunk))
        total += len(chunk)
    return " … ".join(c for _, c in sorted(picked))
