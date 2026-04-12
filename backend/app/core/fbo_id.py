"""FBO ID — app-wide unique account identifier (login + directory)."""

from __future__ import annotations

import re

__all__ = ["normalize_fbo_id", "normalize_registration_fbo_id", "digits_only_fbo"]


def normalize_fbo_id(raw: str) -> str:
    """Strip and lowercase so uniqueness is case-insensitive (e.g. ``FBO-1`` == ``fbo-1``)."""
    return raw.strip().lower()


def normalize_registration_fbo_id(raw: str) -> str:
    """Legacy registration: strip whitespace and a single leading ``#`` (``#910…`` and ``910…``)."""
    return (raw or "").strip().lstrip("#").strip()


def digits_only_fbo(raw: str) -> str:
    """Digits-only signature — legacy duplicate check for FBO variants."""
    return re.sub(r"\D", "", raw or "")
