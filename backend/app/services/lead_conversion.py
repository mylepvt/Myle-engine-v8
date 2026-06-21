"""Post-close onboarding: mint a register link when a lead converts, auto-send it
to the prospect over WhatsApp, and alert the closer's leader / management of the win.

Kept separate from ``leads_service`` so the conversion side-effects (token, WhatsApp,
win alert) stay in one place and can be reused by every path that reaches
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
    """Tell the closer's leader + management that a lead was closed."""
    from app.services.user_hierarchy import nearest_leader_for_user
    from app.services.whatsapp_leader_alerts import send_system_alert
    from app.services.whatsapp_management_updates import get_management_phone

    closer_name = (closer.username or closer.name) if closer else "A team member"
    msg = f"\U0001F3C6 Win! {closer_name} closed lead '{lead.name}'."

    phones: set[str] = set()
    if closer is not None:
        leader = await nearest_leader_for_user(session, closer.id)
        if leader is not None:
            leader_user = (
                await session.execute(select(User).where(User.id == leader.id))
            ).scalar_one_or_none()
            if leader_user and leader_user.phone:
                phones.add(leader_user.phone)
    mgmt = await get_management_phone(session)
    if mgmt:
        phones.add(mgmt)

    for phone in phones:
        try:
            await send_system_alert(phone, msg, session, message_type="conversion_win")
        except Exception as exc:  # noqa: BLE001 - never block conversion on alert
            logger.warning("conversion win alert failed lead_id=%s: %s", lead.id, exc)


async def handle_lead_converted(
    session: AsyncSession,
    *,
    lead: Lead,
    public_app_url: str | None = None,
) -> dict:
    """Run once when a lead first enters ``converted``.

    Mints the register token, auto-sends the register link to the prospect over
    WhatsApp, and alerts the closer's leader / management. Idempotent: if the lead
    already registered we skip. Returns the link payload for the API response.
    """
    from app.services.whatsapp_leader_alerts import send_system_alert

    if lead.registered_user_id is not None:
        return {"already_registered": True}

    base = public_app_url or await resolve_public_app_url(session)
    token = await ensure_register_token(session, lead)
    register_url = build_register_url(base, token)
    message = build_register_message(lead.name, register_url)
    manual_share_url = build_manual_share_url(lead.phone, message)

    sent = False
    if lead.phone:
        try:
            sent = await send_system_alert(
                lead.phone, message, session, message_type="register_invite"
            )
        except Exception as exc:  # noqa: BLE001 - fall back to manual share
            logger.warning("register link auto-send failed lead_id=%s: %s", lead.id, exc)
    if sent:
        lead.register_link_sent_at = datetime.now(timezone.utc)

    closer = None
    if lead.assigned_to_user_id is not None:
        closer = (
            await session.execute(select(User).where(User.id == lead.assigned_to_user_id))
        ).scalar_one_or_none()
    await _notify_win(session, lead, closer)

    return {
        "register_url": register_url,
        "manual_share_url": manual_share_url,
        "auto_sent": sent,
    }


async def build_or_resend_register_link(
    session: AsyncSession,
    *,
    lead: Lead,
    resend: bool = False,
    public_app_url: str | None = None,
) -> dict:
    """Ensure a register token exists and return its link payload. When ``resend`` is
    set, also re-send the WhatsApp invite. Does NOT re-fire the win alert (that only
    happens on the first conversion)."""
    base = public_app_url or await resolve_public_app_url(session)
    token = await ensure_register_token(session, lead)
    register_url = build_register_url(base, token)
    message = build_register_message(lead.name, register_url)
    manual_share_url = build_manual_share_url(lead.phone, message)

    auto_sent = False
    if resend and lead.phone and lead.registered_user_id is None:
        from app.services.whatsapp_leader_alerts import send_system_alert

        try:
            auto_sent = await send_system_alert(
                lead.phone, message, session, message_type="register_invite"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("register link resend failed lead_id=%s: %s", lead.id, exc)
        if auto_sent:
            lead.register_link_sent_at = datetime.now(timezone.utc)

    return {
        "register_url": register_url,
        "manual_share_url": manual_share_url,
        "auto_sent": auto_sent,
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
