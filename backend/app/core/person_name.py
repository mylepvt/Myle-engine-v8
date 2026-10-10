"""Readable person names for the UI.

Many members registered usernames like ``Akansha_Kharwar`` or ``anushka_jaiswal``;
shown as-is they read like database keys. ``person_name`` turns them into
"Akansha Kharwar" / "Anushka Jaiswal" (words already capitalised are left alone,
so "McKenzie" or "DJ" survive). Login IDs such as ``fbo-leader-001`` are not names
and stay untouched.
"""

from __future__ import annotations

import re

_LOGIN_ID = re.compile(r"^[a-z]+(-[a-z0-9]+)+$", re.IGNORECASE)


def person_name(raw: str | None, fallback: str = "") -> str:
    text = (raw or "").strip()
    if not text or _LOGIN_ID.match(text):
        return text or fallback
    words = re.sub(r"[_\s]+", " ", text).strip().split(" ")
    return " ".join(w[:1].upper() + w[1:] if w[:1].islower() else w for w in words) or fallback


def first_name(raw: str | None, fallback: str = "") -> str:
    full = person_name(raw)
    return full.split(" ")[0] if full else fallback
