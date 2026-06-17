"""Lead-capture categories — the **admin-fixed** source list for member capture links.

Each member generates personal capture links tagged with one of these categories; the
slug is stored on the resulting ``Lead.source`` so reporting can group leads by where
they came from. To change the available categories, edit ``CAPTURE_CATEGORIES`` here
(slug must stay <= 50 chars to fit ``Lead.source``). Slugs are stable identifiers —
rename labels freely, but avoid changing existing slugs (it orphans historical leads).
"""
from __future__ import annotations

CAPTURE_CATEGORIES: list[dict[str, str]] = [
    {"slug": "known_zone", "label": "Known Zone"},
    {"slug": "referral", "label": "Referral"},
    {"slug": "whatsapp_status", "label": "WhatsApp Status"},
    {"slug": "social_reel", "label": "Reel / Social"},
    {"slug": "daily_prospecting", "label": "Daily Prospecting"},
    {"slug": "event", "label": "Event / Seminar"},
]

_BY_SLUG = {c["slug"]: c["label"] for c in CAPTURE_CATEGORIES}


def is_valid_category(slug: str) -> bool:
    return slug in _BY_SLUG


def category_label(slug: str) -> str:
    """Human label for a slug; falls back to the slug itself if unknown."""
    return _BY_SLUG.get(slug, slug)
