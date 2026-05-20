"""Thin helper to write WhatsApp activity log rows."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.whatsapp_log import WhatsAppLog

logger = logging.getLogger(__name__)


def _push_realtime() -> None:
    """Fire-and-forget realtime invalidation via existing WS hub."""
    try:
        from app.core.realtime_hub import notify_topics
        asyncio.ensure_future(notify_topics("whatsapp_log"))
    except Exception:
        pass


async def log_wa_outbound(
    session: AsyncSession,
    *,
    phone: str | None,
    message: str,
    message_type: str,
    result: dict[str, Any],
    related_user_id: int | None = None,
) -> None:
    """Write one outbound log row — never raises."""
    try:
        ok = bool(result.get("ok"))
        row = WhatsAppLog(
            direction="out",
            message_type=message_type,
            phone=phone,
            message_preview=message[:400],
            status="sent" if ok else "failed",
            error=None if ok else (result.get("error") or result.get("detail") or "unknown")[:400],
            wa_message_id=result.get("wa_message_id"),
            related_user_id=related_user_id,
        )
        session.add(row)
        await session.flush()
        _push_realtime()
    except Exception:
        logger.exception("wa log write failed (non-fatal)")


async def log_wa_inbound(
    session: AsyncSession,
    *,
    phone: str | None,
    message: str,
    message_type: str,
    wa_message_id: str | None = None,
    related_user_id: int | None = None,
) -> None:
    """Write one inbound log row — never raises."""
    try:
        row = WhatsAppLog(
            direction="in",
            message_type=message_type,
            phone=phone,
            message_preview=message[:400],
            status="received",
            wa_message_id=wa_message_id,
            related_user_id=related_user_id,
        )
        session.add(row)
        await session.flush()
        _push_realtime()
    except Exception:
        logger.exception("wa log write failed (non-fatal)")
