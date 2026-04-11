"""FBO ID — app-wide unique account identifier (login + directory)."""

from __future__ import annotations

__all__ = ["normalize_fbo_id"]


def normalize_fbo_id(raw: str) -> str:
    """Strip and lowercase so uniqueness is case-insensitive (e.g. ``FBO-1`` == ``fbo-1``)."""
    return raw.strip().lower()
