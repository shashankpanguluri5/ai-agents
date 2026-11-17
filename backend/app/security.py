"""Input cleaning, untrusted-content handling, quote verification, and URL safety."""

import ipaddress
import re
import socket
import unicodedata
from urllib.parse import urlparse

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WS = re.compile(r"\s+")


def clean_text(text: str, max_len: int = 8000) -> str:
    """Strip control characters and trim. Used on all founder input."""
    text = unicodedata.normalize("NFC", text or "")
    return _CONTROL.sub("", text).strip()[:max_len]


def wrap_untrusted(text: str, source: str, max_len: int = 12000) -> str:
    """Wrap third-party content so the model treats it as data, not instructions.

    Any tag look-alikes in the content are neutralised so a page can't close the wrapper early.
    """
    body = (text or "")[:max_len]
    body = re.sub(r"</?\s*untrusted_source[^>]*>", "[removed-tag]", body, flags=re.IGNORECASE)
    safe_source = re.sub(r"[\"<>]", "", source)[:300]
    return f'<untrusted_source origin="{safe_source}">\n{body}\n</untrusted_source>'


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = (
        text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
        .replace("–", "-").replace("—", "-")
    )
    return _WS.sub(" ", text).strip()


def verify_quote(quote: str, source_text: str, min_len: int = 20) -> bool:
    """True only if the quote appears verbatim (ignoring case/whitespace/quote style) in the fetched text.

    This is the main guard against invented evidence: a model can't cite what the page doesn't say.
    """
    q = _normalize(quote).strip(" .\"'")
    if len(q) < min_len:
        return False
    return q in _normalize(source_text)


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def is_safe_url(url: str) -> bool:
    """Allow only public http(s) URLs, so fetched links can't reach the local network (SSRF guard)."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except (socket.gaierror, UnicodeError):
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            return False
    return True
