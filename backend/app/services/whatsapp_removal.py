"""WhatsApp outreach for removed members — send notification + store reply."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.member_removal_outreach import MemberRemovalOutreach
from app.models.user import User

logger = logging.getLogger(__name__)


def _whatsapp_digits(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    return digits if len(digits) >= 10 else None


def build_removal_message(*, member_name: str, removal_reason: str | None) -> str:
    first_name = (member_name or "there").strip().split()[0]
    reason_line = f"\nReason: {removal_reason}" if removal_reason else ""
    return (
        f"Hi {first_name},\n\n"
        f"You have been removed from the Myle system.{reason_line}\n\n"
        "We'd love to understand what happened. Could you please reply to this message and let us know:\n"
        "• Why were you unable to stay active?\n"
        "• Is there anything we can do to help?\n\n"
        "Your response will go directly to the admin team.\n\n"
        "— Myle Team"
    )


def _build_manual_share_url(*, phone: str | None, message: str) -> str | None:
    digits = _whatsapp_digits(phone)
    if not digits:
        return None
    return f"https://wa.me/{digits}?text={urllib.parse.quote(message)}"


def _post_json_sync(
    url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float
) -> tuple[int, str]:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    hdrs = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        body = resp.read().decode("utf-8", errors="replace")
        return int(resp.status), body[:2000]


async def send_removal_whatsapp(
    *,
    user: User,
    session: AsyncSession,
) -> MemberRemovalOutreach:
    """Create outreach record and fire the WhatsApp message."""
    phone = getattr(user, "phone", None)
    member_name = (user.name or user.username or user.fbo_id or "Member").strip()
    removal_reason = (getattr(user, "removal_reason", None) or "").strip() or None

    message = build_removal_message(member_name=member_name, removal_reason=removal_reason)
    manual_share_url = _build_manual_share_url(phone=phone, message=message)

    record = MemberRemovalOutreach(
        user_id=user.id,
        phone=phone,
        member_name=member_name,
        removal_reason=removal_reason,
        send_status="pending",
        manual_share_url=manual_share_url,
    )
    session.add(record)
    await session.flush()  # get record.id

    url = (settings.ctcs_whatsapp_webhook_url or "").strip()
    if not url:
        logger.info(
            "removal whatsapp stub user_id=%s phone_tail=%s",
            user.id,
            (phone or "")[-4:],
        )
        record.send_status = "stub"
        record.sent_at = datetime.now(timezone.utc)
        await session.flush()
        return record

    payload: dict[str, Any] = {
        "event": "member_removed_outreach",
        "user_id": user.id,
        "phone": phone,
        "member_name": member_name,
        "removal_reason": removal_reason,
        "message": message,
        "template": "member_removal_v1",
    }
    headers: dict[str, str] = {}
    secret = (settings.ctcs_whatsapp_webhook_secret or "").strip()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"

    timeout = float(settings.ctcs_whatsapp_timeout_seconds)
    try:
        status, _ = await asyncio.to_thread(_post_json_sync, url, payload, headers, timeout)
        if 200 <= status < 300:
            record.send_status = "sent"
            record.sent_at = datetime.now(timezone.utc)
        else:
            record.send_status = "failed"
            record.send_error = f"HTTP {status}"
    except Exception as exc:
        logger.warning("removal whatsapp send failed user_id=%s: %s", user.id, exc)
        record.send_status = "failed"
        record.send_error = str(exc)[:500]

    await session.flush()
    return record


async def record_reply(
    *,
    phone: str,
    reply_text: str,
    wa_message_id: str | None,
    session: AsyncSession,
) -> MemberRemovalOutreach | None:
    """Match incoming WhatsApp reply to the most recent outreach for this phone and store it."""
    digits = _whatsapp_digits(phone)
    if not digits:
        return None

    # Try exact phone match, then digits-only match
    stmt = (
        select(MemberRemovalOutreach)
        .where(MemberRemovalOutreach.reply_text.is_(None))
        .order_by(MemberRemovalOutreach.created_at.desc())
        .limit(20)
    )
    rows = (await session.execute(stmt)).scalars().all()

    match: MemberRemovalOutreach | None = None
    for row in rows:
        row_digits = _whatsapp_digits(row.phone)
        if row_digits and row_digits == digits:
            match = row
            break

    if match is None:
        logger.info("removal outreach: no pending record for phone_tail=%s", digits[-4:])
        return None

    match.reply_text = reply_text.strip()
    match.replied_at = datetime.now(timezone.utc)
    if wa_message_id:
        match.wa_message_id = wa_message_id
    await session.flush()
    return match
