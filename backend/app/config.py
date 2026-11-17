"""Settings loaded from environment variables (and backend/.env)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", "").strip())
    groq_model: str = field(default_factory=lambda: os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"))
    ollama_url: str = field(default_factory=lambda: os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/"))
    ollama_model: str = field(default_factory=lambda: os.getenv("OLLAMA_MODEL", "qwen2.5:7b"))
    llm_providers: list[str] = field(
        default_factory=lambda: [p.strip() for p in os.getenv("LLM_PROVIDERS", "groq,ollama").split(",") if p.strip()]
    )
    tavily_api_key: str = field(default_factory=lambda: os.getenv("TAVILY_API_KEY", "").strip())
    database_path: Path = field(
        default_factory=lambda: (BACKEND_DIR / os.getenv("DATABASE_PATH", "data/premise.db")).resolve()
    )
    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]
    )
    max_assumptions_to_research: int = field(default_factory=lambda: _int("MAX_ASSUMPTIONS_TO_RESEARCH", 6))
    sources_per_assumption: int = field(default_factory=lambda: _int("SOURCES_PER_ASSUMPTION", 4))


def get_settings() -> Settings:
    return Settings()
