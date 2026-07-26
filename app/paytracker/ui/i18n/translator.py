from __future__ import annotations

import json
from pathlib import Path

_CATALOG_DIR = Path(__file__).parent
_SUPPORTED_LANGUAGES = ("en", "pl", "de")
_DEFAULT_LANGUAGE = "en"

_catalogs: dict[str, dict[str, str]] = {}
_current_language = _DEFAULT_LANGUAGE


def _load_catalogs() -> None:
    if _catalogs:
        return
    for lang in _SUPPORTED_LANGUAGES:
        path = _CATALOG_DIR / f"{lang}.json"
        _catalogs[lang] = json.loads(path.read_text()) if path.exists() else {}


def set_language(lang: str | None) -> None:
    global _current_language
    _load_catalogs()
    _current_language = lang if lang in _catalogs else _DEFAULT_LANGUAGE


def get_language() -> str:
    return _current_language


def t(key: str, **kwargs) -> str:
    """Translate `key` in the current language, falling back to English,
    falling back to the key itself if missing everywhere (so a typo'd or
    not-yet-translated key is visibly wrong instead of silently blank)."""
    _load_catalogs()
    template = (
        _catalogs.get(_current_language, {}).get(key)
        or _catalogs.get(_DEFAULT_LANGUAGE, {}).get(key)
        or key
    )
    return template.format(**kwargs) if kwargs else template
