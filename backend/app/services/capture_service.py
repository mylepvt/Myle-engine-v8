"""Member lead-capture links — create/list links and accept public form submissions.

A prospect submitting the public form creates a ``Lead`` owned by the link owner with
``source`` set to the link's category and ``status='new_lead'`` — so it lands directly in
the owner's calling board, tagged by where it came from.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.capture_categories import (
    CAPTURE_CATEGORIES,
    category_label,
    is_valid_category,
)
from app.models.lead import Lead
from app.models.lead_capture_link import LeadCaptureLink
from app.models.user import User

# Public-form abuse guard: max successful submissions per link inside the window.
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX = 8


def _normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else (digits or None)


class CaptureError(Exception):
    """Raised for invalid capture-link operations (maps to 4xx at the API edge)."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def list_categories() -> list[dict[str, str]]:
    return list(CAPTURE_CATEGORIES)


# ── Member (authed) ───────────────────────────────────────────────────────────

async def create_link(
    session: AsyncSession, *, owner_user_id: int, category: str
) -> LeadCaptureLink:
    if not is_valid_category(category):
        raise CaptureError("Unknown category", status_code=400)
    link = LeadCaptureLink(
        token=secrets.token_urlsafe(16),
        owner_user_id=owner_user_id,
        category=category,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def list_my_links(
    session: AsyncSession, *, owner_user_id: int
) -> list[LeadCaptureLink]:
    rows = (
        await session.execute(
            select(LeadCaptureLink)
            .where(LeadCaptureLink.owner_user_id == owner_user_id)
            .order_by(LeadCaptureLink.id.desc())
        )
    ).scalars().all()
    return list(rows)


async def deactivate_link(
    session: AsyncSession, *, owner_user_id: int, link_id: int
) -> LeadCaptureLink:
    link = await session.get(LeadCaptureLink, link_id)
    if link is None or link.owner_user_id != owner_user_id:
        raise CaptureError("Link not found", status_code=404)
    link.active = False
    await session.commit()
    await session.refresh(link)
    return link


async def get_owned_link(
    session: AsyncSession, *, owner_user_id: int, link_id: int
) -> LeadCaptureLink:
    link = await session.get(LeadCaptureLink, link_id)
    if link is None or link.owner_user_id != owner_user_id:
        raise CaptureError("Link not found", status_code=404)
    return link


async def set_poster_url(
    session: AsyncSession, *, link: LeadCaptureLink, poster_url: str
) -> LeadCaptureLink:
    link.poster_url = poster_url
    await session.commit()
    await session.refresh(link)
    return link


async def set_custom_message(
    session: AsyncSession, *, owner_user_id: int, link_id: int, message: str | None
) -> LeadCaptureLink:
    link = await get_owned_link(session, owner_user_id=owner_user_id, link_id=link_id)
    cleaned = (message or "").strip()
    link.custom_message = cleaned or None
    await session.commit()
    await session.refresh(link)
    return link


# ── Public (no-auth) ──────────────────────────────────────────────────────────

async def _get_active_link(session: AsyncSession, token: str) -> LeadCaptureLink:
    link = (
        await session.execute(
            select(LeadCaptureLink).where(LeadCaptureLink.token == token)
        )
    ).scalars().first()
    if link is None or not link.active:
        raise CaptureError("This link is no longer active", status_code=404)
    return link


async def get_public_info(session: AsyncSession, token: str) -> dict[str, str]:
    link = await _get_active_link(session, token)
    owner = await session.get(User, link.owner_user_id)
    owner_name = (getattr(owner, "name", None) or "Our team").strip() or "Our team"
    # Count the form open (drives conversion % = leads_count / views). Recording only.
    link.views = (link.views or 0) + 1
    await session.commit()
    return {
        "owner_name": owner_name,
        "category": link.category,
        "category_label": category_label(link.category),
    }


async def submit_public_lead(
    session: AsyncSession,
    token: str,
    *,
    name: str,
    phone: str,
    city: str | None,
    age: int | None,
    honeypot: str | None = None,
) -> None:
    link = await _get_active_link(session, token)

    # Bot trap: humans never see/fill the hidden field — drop silently (look successful).
    if honeypot and honeypot.strip():
        return

    # Rate limit: cap successful captures per link inside the window.
    since = datetime.now(timezone.utc) - timedelta(seconds=_RATE_LIMIT_WINDOW_SECONDS)
    recent = (
        await session.execute(
            select(func.count())
            .select_from(Lead)
            .where(Lead.capture_link_id == link.id, Lead.created_at >= since)
        )
    ).scalar_one()
    if recent >= _RATE_LIMIT_MAX:
        raise CaptureError("Too many submissions, please try again shortly", status_code=429)

    # Duplicate guard: same phone already captured for this owner → don't create another.
    # Suffix match on the last 10 digits handles "+91"/spacing variants (portable SQL).
    norm = _normalize_phone(phone)
    if norm:
        existing = (
            await session.execute(
                select(Lead.id).where(
                    Lead.owner_user_id == link.owner_user_id,
                    Lead.deleted_at.is_(None),
                    Lead.phone.like(f"%{norm}"),
                )
            )
        ).first()
        if existing is not None:
            return

    lead = Lead(
        name=name.strip(),
        status="new_lead",
        created_by_user_id=link.owner_user_id,
        owner_user_id=link.owner_user_id,
        assigned_to_user_id=link.owner_user_id,
        phone=phone.strip(),
        city=(city or None),
        age=age,
        source=link.category,
        capture_link_id=link.id,
    )
    session.add(lead)
    link.leads_count = (link.leads_count or 0) + 1
    await session.commit()
