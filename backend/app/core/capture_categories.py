"""Lead-capture categories — the **admin-fixed** source list for member capture links.

Each member generates personal capture links tagged with one of these categories; the
slug is stored on the resulting ``Lead.source`` so reporting can group leads by where
they came from. To change the available categories, edit ``CAPTURE_CATEGORIES`` here
(slug must stay <= 50 chars to fit ``Lead.source``). Slugs are stable identifiers —
rename labels freely, but avoid changing existing slugs (it orphans historical leads).

Each category also carries a default ``message`` — the English prefill used when the
member shares their poster + link. Tone differs by audience: Known Zone is warm/personal
(they already know the member); the rest are curiosity/selective for colder platforms.
Deliberately avoids worn-out "work from home / online work" phrasing. ``{link}`` is
substituted with the public capture URL on the client.
"""
from __future__ import annotations

CAPTURE_CATEGORIES: list[dict[str, str]] = [
    {
        "slug": "known_zone",
        "label": "Known Zone",
        "message": (
            "Hey! I've teamed up with an international community and I'm building "
            "something genuinely exciting. I instantly thought of you — take a "
            "2-minute look and let's talk 👇\n{link}"
        ),
    },
    {
        "slug": "referral",
        "label": "Referral",
        "message": (
            "Someone I trust pointed me your way 🙌 I think you'd be a great fit for "
            "what we're building with our international team. Quick look 👇\n{link}"
        ),
    },
    {
        "slug": "whatsapp_status",
        "label": "WhatsApp Status",
        "message": (
            "Big things are happening with our international community 🚀 If you've "
            "been waiting for the right moment, this could be it. Tap to see 👇\n{link}"
        ),
    },
    {
        "slug": "social_reel",
        "label": "Reel / Social",
        "message": (
            "Glad you stopped by 👋 We're growing a serious international community and "
            "picking motivated people to grow with. Curious? Have a look 👇\n{link}"
        ),
    },
    {
        "slug": "daily_prospecting",
        "label": "Daily Prospecting",
        "message": (
            "Hi! I'm connecting with a few driven people to grow alongside our "
            "international team this year. Felt you might be a fit — 2-minute look "
            "👇\n{link}"
        ),
    },
    {
        "slug": "event",
        "label": "Event / Seminar",
        "message": (
            "Great connecting with you! 🙌 Here's the link I mentioned about our "
            "international community — take a look and let's continue the conversation "
            "👇\n{link}"
        ),
    },
]

_BY_SLUG = {c["slug"]: c["label"] for c in CAPTURE_CATEGORIES}
_MSG_BY_SLUG = {c["slug"]: c["message"] for c in CAPTURE_CATEGORIES}

_DEFAULT_MESSAGE = (
    "Hey! I'm building something exciting with an international community and thought "
    "of you. Take a quick look 👇\n{link}"
)


def is_valid_category(slug: str) -> bool:
    return slug in _BY_SLUG


def category_label(slug: str) -> str:
    """Human label for a slug; falls back to the slug itself if unknown."""
    return _BY_SLUG.get(slug, slug)


def category_message(slug: str) -> str:
    """Default English share message template for a slug (contains ``{link}``)."""
    return _MSG_BY_SLUG.get(slug, _DEFAULT_MESSAGE)
