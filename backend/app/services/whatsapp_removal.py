"""WhatsApp outreach for removed members — Meta Cloud API + webhook fallback."""

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
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


def _whatsapp_digits(phone: str | None) -> str | None:
    """Return E.164 digits only (no +). Indian 10-digit → prefix 91."""
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


# ---------------------------------------------------------------------------
# DB-backed config helpers (DB settings override env vars)
# ---------------------------------------------------------------------------

async def get_meta_config(session: AsyncSession) -> tuple[str, str, str]:
    """
    Returns (phone_number_id, access_token, api_version).
    DB app_settings take precedence over env vars.
    """
    svc = SettingsService(session)
    phone_number_id = (
        (await svc.get_app_setting("whatsapp.meta.phone_number_id") or "").strip()
        or (settings.whatsapp_meta_phone_number_id or "").strip()
    )
    access_token = (
        (await svc.get_app_setting("whatsapp.meta.access_token") or "").strip()
        or (settings.whatsapp_meta_access_token or "").strip()
    )
    api_version = (
        (await svc.get_app_setting("whatsapp.meta.api_version") or "").strip()
        or (settings.whatsapp_meta_api_version or "").strip()
        or "v19.0"
    )
    return phone_number_id, access_token, api_version


async def get_verify_token(session: AsyncSession) -> str:
    """Returns Meta webhook verify token — DB first, env var fallback."""
    svc = SettingsService(session)
    return (
        (await svc.get_app_setting("whatsapp.meta.verify_token") or "").strip()
        or (settings.whatsapp_meta_verify_token or "").strip()
    )


# ---------------------------------------------------------------------------
# Meta Cloud API sender
# ---------------------------------------------------------------------------

async def _send_via_meta_api(
    *, phone: str, message: str, phone_number_id: str, access_token: str, api_version: str,
    member_name: str = "", removal_reason: str = "", template_name: str = "", template_lang: str = "en",
) -> dict[str, Any]:
    digits = _whatsapp_digits(phone)
    if not digits:
        return {"ok": False, "error": "invalid_phone"}

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"

    if template_name:
        # Use approved template — works outside 24-hour window
        first_name = (member_name or "Member").strip().split()[0]
        reason_text = (removal_reason or "Not specified").strip()
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": digits,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": template_lang or "en"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": first_name},
                            {"type": "text", "text": reason_text},
                        ],
                    }
                ],
            },
        }
        logger.info("removal outreach using template=%s phone_tail=%s", template_name, digits[-4:])
    else:
        # Fallback: free-form text (only works within 24-hour window)
        payload = {
            "messaging_product": "whatsapp",
            "to": digits,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }
    headers = {"Authorization": f"Bearer {access_token}"}
    timeout = float(settings.ctcs_whatsapp_timeout_seconds)
    try:
        status, body = await asyncio.to_thread(_post_json_sync, url, payload, headers, timeout)
        ok = 200 <= status < 300
        if not ok:
            logger.warning("meta whatsapp non-2xx status=%s body=%s", status, body[:300])
        wa_message_id: str | None = None
        try:
            wa_message_id = json.loads(body).get("messages", [{}])[0].get("id")
        except Exception:
            pass
        return {"ok": ok, "channel": "meta_cloud_api", "http_status": status, "body": body[:500], "wa_message_id": wa_message_id}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500] if exc.fp else ""
        logger.warning("meta whatsapp HTTPError %s: %s", exc.code, body)
        return {"ok": False, "channel": "meta_cloud_api", "error": f"http_{exc.code}", "detail": body}
    except Exception as exc:
        logger.exception("meta whatsapp send failed")
        return {"ok": False, "channel": "meta_cloud_api", "error": str(exc)[:300]}


# ---------------------------------------------------------------------------
# Generic webhook sender (existing CTCS webhook pattern)
# ---------------------------------------------------------------------------

async def _send_via_webhook(
    *, user: User, phone: str | None, message: str, removal_reason: str | None
) -> dict[str, Any]:
    url = (settings.ctcs_whatsapp_webhook_url or "").strip()
    if not url:
        return {"ok": True, "channel": "whatsapp_stub"}

    payload: dict[str, Any] = {
        "event": "member_removed_outreach",
        "user_id": user.id,
        "phone": phone,
        "member_name": (user.name or user.username or user.fbo_id or "Member").strip(),
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
        ok = 200 <= status < 300
        return {"ok": ok, "channel": "whatsapp_webhook", "http_status": status}
    except Exception as exc:
        logger.warning("removal webhook send failed user_id=%s: %s", user.id, exc)
        return {"ok": False, "channel": "whatsapp_webhook", "error": str(exc)[:300]}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def send_removal_whatsapp(
    *,
    user: User,
    session: AsyncSession,
) -> MemberRemovalOutreach:
    """Create outreach record and send WhatsApp message (Meta API → webhook → stub)."""
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
    await session.flush()

    # Meta Cloud API only — no webhook fallback (webhook returns ok=True silently without sending)
    phone_number_id, access_token, api_version = await get_meta_config(session)
    svc = SettingsService(session)
    tmpl_name = (
        (await svc.get_app_setting("whatsapp.removal_template_name") or "").strip()
        or (settings.whatsapp_removal_template_name or "").strip()
    )
    tmpl_lang = (
        (await svc.get_app_setting("whatsapp.removal_template_lang") or "").strip()
        or (settings.whatsapp_removal_template_lang or "").strip()
        or "en"
    )
    if phone_number_id and access_token and phone:
        result = await _send_via_meta_api(
            phone=phone,
            message=message,
            phone_number_id=phone_number_id,
            access_token=access_token,
            api_version=api_version,
            member_name=member_name,
            removal_reason=removal_reason or "",
            template_name=tmpl_name,
            template_lang=tmpl_lang,
        )
    else:
        logger.info("removal whatsapp stub user_id=%s phone_tail=%s (no meta config)", user.id, (phone or "")[-4:])
        result = {"ok": True, "channel": "whatsapp_stub"}

    channel = result.get("channel", "unknown")
    if result.get("ok"):
        record.send_status = "stub" if channel == "whatsapp_stub" else "sent"
        record.sent_at = datetime.now(timezone.utc)
        if result.get("wa_message_id"):
            record.wa_message_id = result["wa_message_id"]
    else:
        record.send_status = "failed"
        record.send_error = (result.get("error") or result.get("detail") or "unknown error")[:500]

    await session.flush()

    if channel != "whatsapp_stub":
        from app.services.whatsapp_log_service import log_wa_outbound
        await log_wa_outbound(
            session,
            phone=phone,
            message=message,
            message_type="removal_outreach",
            result=result,
            related_user_id=user.id,
        )

    return record


async def record_reply(
    *,
    phone: str,
    reply_text: str,
    wa_message_id: str | None,
    session: AsyncSession,
) -> MemberRemovalOutreach | None:
    """Match incoming WhatsApp reply to the most recent outreach for this phone."""
    digits = _whatsapp_digits(phone)
    if not digits:
        return None

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
