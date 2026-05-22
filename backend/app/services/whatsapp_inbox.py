"""Helpers for persisting inbound WhatsApp replies and command-like messages."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.models.whatsapp_inbound_message import WhatsAppInboundMessage
from app.services.whatsapp_removal import _whatsapp_digits

_SPACE_RE = re.compile(r"\s+")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _normalize_text(raw: str | None) -> str | None:
    value = (raw or "").strip()
    return value or None


def _slugify(raw: str | None) -> str | None:
    value = _normalize_text(raw)
    if not value:
        return None
    slug = _SLUG_RE.sub("_", value.lower()).strip("_")
    return slug[:64] or None


def derive_command_key(*, message_text: str | None, command_id: str | None = None) -> str | None:
    explicit = _slugify(command_id)
    if explicit:
        return explicit

    normalized = _normalize_text(message_text)
    if not normalized:
        return None
    compact = _SPACE_RE.sub(" ", normalized).lower()

    if compact in {"ok", "okay", "yes", "done", "received"} or normalized == "✅":
        return "ack"
    if "not interested" in compact or compact in {"no", "nah", "nahi"}:
        return "not_interested"
    if "interested" in compact:
        return "interested"
    if compact in {"later", "call later"} or ("call" in compact and "later" in compact):
        return "call_later"
    if compact in {"stop", "unsubscribe", "end", "block"}:
        return "stop"
    return None


async def _match_recent_lead_id(session: AsyncSession, digits: str | None) -> int | None:
    if not digits:
        return None
    rows = (
        await session.execute(
            select(Lead)
            .where(Lead.phone.isnot(None), Lead.deleted_at.is_(None))
            .order_by(Lead.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    for row in rows:
        if _whatsapp_digits(row.phone) == digits:
            return row.id
    return None


async def _match_recent_user_id(session: AsyncSession, digits: str | None) -> int | None:
    if not digits:
        return None
    rows = (
        await session.execute(
            select(User)
            .where(User.phone.isnot(None))
            .order_by(User.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    for row in rows:
        if _whatsapp_digits(row.phone) == digits:
            return row.id
    return None


async def store_inbound_message(
    *,
    session: AsyncSession,
    source: str,
    phone: str | None,
    profile_name: str | None,
    message_type: str,
    message_text: str | None,
    command_id: str | None,
    wa_message_id: str | None,
    reply_to_wa_message_id: str | None,
    matched_removal_outreach_id: int | None,
    raw_payload: dict[str, Any] | None,
) -> WhatsAppInboundMessage:
    digits = _whatsapp_digits(phone)
    row = WhatsAppInboundMessage(
        source=source,
        phone=(phone or "").strip() or None,
        phone_digits=digits,
        profile_name=_normalize_text(profile_name),
        message_type=(message_type or "unknown").strip() or "unknown",
        message_text=_normalize_text(message_text),
        command_key=derive_command_key(message_text=message_text, command_id=command_id),
        wa_message_id=_normalize_text(wa_message_id),
        reply_to_wa_message_id=_normalize_text(reply_to_wa_message_id),
        matched_lead_id=await _match_recent_lead_id(session, digits),
        matched_user_id=await _match_recent_user_id(session, digits),
        matched_removal_outreach_id=matched_removal_outreach_id,
        raw_payload=raw_payload,
    )
    session.add(row)
    await session.flush()
    return row
