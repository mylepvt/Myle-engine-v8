"""Post-close onboarding: mint a register link when a lead converts (the closer shares
it manually) and push-notify the closer's leader of the win.

Kept separate from ``leads_service`` so the conversion side-effects (token, win
alert) stay in one place and can be reused by every path that reaches
``converted`` (status PATCH, stage transition).
"""
from __future__ import annotations

import logging
import secrets
import urllib.parse
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.lead import Lead
from app.models.user import User

logger = logging.getLogger(__name__)


def new_register_token() -> str:
    """One-time opaque token for a lead's register link."""
    return secrets.token_urlsafe(32)[:64]


async def resolve_public_app_url(session: AsyncSession) -> str:
    """Public frontend origin for building links, without a request object.

    Mirrors ``flp_min_billing_video.resolve_public_app_url`` but request-free: reads
    the configured app setting, else falls back to the first https CORS origin.
    """
    from app.services.flp_min_billing_video import get_app_setting

    configured = await get_app_setting(session, "public_app_url")
    if not configured:
        configured = await get_app_setting(session, "frontend_public_url")
    if not configured:
        origins = [o.strip() for o in (settings.backend_cors_origins or "").split(",")]
        configured = next((o for o in origins if o.startswith("https://")), "")
    if not configured:
        configured = "https://mylepvt.github.io"
    return configured.rstrip("/")


def build_register_url(public_app_url: str, token: str) -> str:
    return f"{public_app_url.rstrip('/')}/register?rt={urllib.parse.quote(token)}"


def build_register_message(lead_name: str, register_url: str) -> str:
    name = (lead_name or "").strip() or "there"
    return (
        f"Hi {name}! Welcome aboard \U0001F389\n\n"
        "Complete your registration here to start your 7-day onboarding training:\n"
        f"{register_url}\n\n"
        "See you on the inside!"
    )


def build_manual_share_url(phone: str | None, message: str) -> str | None:
    """wa.me deep link the closer can tap to send the invite by hand (copy/resend)."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) < 10:
        return None
    return f"https://wa.me/{digits}?text={urllib.parse.quote(message)}"


async def ensure_register_token(session: AsyncSession, lead: Lead) -> str:
    if not lead.register_token:
        lead.register_token = new_register_token()
        await session.flush()
    return lead.register_token


async def _notify_win(session: AsyncSession, lead: Lead, closer: User | None) -> None:
    """Tell the closer's leader (in-app push) that a lead was closed."""
    from app.services.push_service import send_push_to_user
    from app.services.user_hierarchy import nearest_leader_for_user

    if closer is None:
        return
    leader = await nearest_leader_for_user(session, closer.id)
    if leader is None:
        return
    closer_name = closer.username or closer.name or "A team member"
    try:
        await send_push_to_user(
            session,
            leader.id,
            title="Lead closed",
            body=f"{closer_name} closed lead '{lead.name}'.",
            url="/dashboard/work/workboard",
        )
    except Exception as exc:  # noqa: BLE001 - never block conversion on alert
        logger.warning("conversion win push failed lead_id=%s: %s", lead.id, exc)


async def handle_lead_converted(
    session: AsyncSession,
    *,
    lead: Lead,
    public_app_url: str | None = None,
) -> dict:
    """Run once when a lead first enters ``converted``.

    Mints the register token and alerts the closer's leader. The register link is
    shared manually by the closer ("Register link" button → WhatsApp); there is no
    automatic WhatsApp send. Idempotent: if the lead already registered we skip.
    Returns the link payload for the API response.
    """
    if lead.registered_user_id is not None:
        return {"already_registered": True}

    base = public_app_url or await resolve_public_app_url(session)
    token = await ensure_register_token(session, lead)
    register_url = build_register_url(base, token)
    message = build_register_message(lead.name, register_url)
    manual_share_url = build_manual_share_url(lead.phone, message)

    closer = None
    if lead.assigned_to_user_id is not None:
        closer = (
            await session.execute(select(User).where(User.id == lead.assigned_to_user_id))
        ).scalar_one_or_none()
    await _notify_win(session, lead, closer)

    return {
        "register_url": register_url,
        "manual_share_url": manual_share_url,
        "auto_sent": False,
    }


async def build_or_resend_register_link(
    session: AsyncSession,
    *,
    lead: Lead,
    resend: bool = False,
    public_app_url: str | None = None,
) -> dict:
    """Ensure a register token exists and return its link payload for manual sharing.
    ``resend`` is accepted for API compatibility (no automatic send). Does NOT re-fire
    the win alert (that only happens on the first conversion)."""
    base = public_app_url or await resolve_public_app_url(session)
    token = await ensure_register_token(session, lead)
    register_url = build_register_url(base, token)
    message = build_register_message(lead.name, register_url)
    manual_share_url = build_manual_share_url(lead.phone, message)

    del resend
    return {
        "register_url": register_url,
        "manual_share_url": manual_share_url,
        "auto_sent": False,
        "already_registered": lead.registered_user_id is not None,
    }


async def resolve_register_link(session: AsyncSession, token: str) -> dict | None:
    """Public: resolve a register token → prefill data (prospect name/phone + the
    closer's FBO id as upline). Returns None for an unknown/used token."""
    token = (token or "").strip()
    if not token:
        return None
    lead = (
        await session.execute(select(Lead).where(Lead.register_token == token))
    ).scalar_one_or_none()
    if lead is None or lead.deleted_at is not None:
        return None
    if lead.registered_user_id is not None:
        return {"found": True, "already_used": True}

    upline_fbo = ""
    if lead.assigned_to_user_id is not None:
        closer = (
            await session.execute(select(User).where(User.id == lead.assigned_to_user_id))
        ).scalar_one_or_none()
        if closer is not None:
            upline_fbo = closer.fbo_id or ""

    return {
        "found": True,
        "already_used": False,
        "name": lead.name or "",
        "phone": lead.phone or "",
        "upline_fbo_id": upline_fbo,
    }


async def link_registered_user(
    session: AsyncSession, *, token: str, user_id: int
) -> None:
    """Bind the freshly-created member back to the lead they registered from."""
    token = (token or "").strip()
    if not token:
        return
    lead = (
        await session.execute(select(Lead).where(Lead.register_token == token))
    ).scalar_one_or_none()
    if lead is None or lead.registered_user_id is not None:
        return
    lead.registered_user_id = user_id
    lead.registered_at = datetime.now(timezone.utc)
