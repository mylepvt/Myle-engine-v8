"""WhatsApp reminders for members who haven't submitted their daily report."""
from __future__ import annotations

import asyncio
import json
import logging
import random
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.report_reminder_outreach import ReportReminderOutreach
from app.models.user import User
from app.services.settings_service import SettingsService
from app.services.whatsapp_removal import (
    _whatsapp_digits,
    _post_json_sync,
    get_meta_config,
)

logger = logging.getLogger(__name__)


_REMINDER_VARIANTS = [
    (
        "Hi {first_name},\n\n"
        "Aapki aaj ki daily report abhi tak submit nahi hui hai. ⏰\n\n"
        "Please Myle dashboard se apni report submit karein taaki aapka record up-to-date rahe.\n\n"
        "— Myle Team"
    ),
    (
        "Hey {first_name}! 👋\n\n"
        "Aaj ki report abhi pending hai — time hai, jaldi submit kar lo.\n\n"
        "Myle app → Work → Daily Report\n\n"
        "— Myle Team"
    ),
    (
        "Hi {first_name},\n\n"
        "Reminder: aaj ki daily report submit karna baaki hai.\n\n"
        "Ek baar Myle dashboard check karo aur report complete kar lo. 💪\n\n"
        "— Myle Team"
    ),
    (
        "{first_name}, aaj ki report miss mat karna! 📋\n\n"
        "Daily report aapke record mein zaroori hai. Dashboard se abhi submit karo.\n\n"
        "— Myle Team"
    ),
    (
        "Hi {first_name} 😊\n\n"
        "Aaj ki daily report abhi submit nahi hui. Thoda sa time nikal ke complete kar lo.\n\n"
        "— Myle Team"
    ),
]


def build_reminder_message(*, member_name: str) -> str:
    first_name = (member_name or "there").strip().split()[0]
    template = random.choice(_REMINDER_VARIANTS)
    return template.format(first_name=first_name)


async def _send_via_meta_api(
    *,
    phone: str,
    message: str,
    phone_number_id: str,
    access_token: str,
    api_version: str,
    template_name: str = "",
    template_lang: str = "en",
    first_name: str = "",
) -> dict[str, Any]:
    digits = _whatsapp_digits(phone)
    if not digits:
        return {"ok": False, "error": "invalid_phone"}

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"

    if template_name:
        # Approved template — works outside 24-hour window
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
                            {"type": "text", "text": first_name or "Member"},
                        ],
                    }
                ],
            },
        }
        logger.info("report reminder using template=%s phone_tail=%s", template_name, digits[-4:])
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
            logger.warning("report reminder meta non-2xx status=%s body=%s", status, body[:300])
        wa_message_id: str | None = None
        try:
            parsed = json.loads(body)
            wa_message_id = parsed.get("messages", [{}])[0].get("id")
        except Exception:
            pass
        return {"ok": ok, "channel": "meta_cloud_api", "http_status": status, "wa_message_id": wa_message_id}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500] if exc.fp else ""
        logger.warning("report reminder meta HTTPError %s: %s", exc.code, body)
        return {"ok": False, "channel": "meta_cloud_api", "error": f"http_{exc.code}", "detail": body}
    except Exception as exc:
        logger.exception("report reminder meta send failed")
        return {"ok": False, "channel": "meta_cloud_api", "error": str(exc)[:300]}


async def send_report_reminder(
    *,
    user: User,
    reminder_date: date,
    session: AsyncSession,
) -> ReportReminderOutreach:
    """Send WhatsApp reminder for unsubmitted daily report and record the attempt."""
    phone = getattr(user, "phone", None)
    member_name = (
        (user.name or "").strip()
        or (getattr(user, "username", None) or "").strip()
        or user.fbo_id
        or "Member"
    )
    first_name = member_name.strip().split()[0]

    message = build_reminder_message(member_name=member_name)

    record = ReportReminderOutreach(
        user_id=user.id,
        reminder_date=reminder_date,
        phone=phone,
        member_name=member_name,
        send_status="pending",
    )
    session.add(record)
    await session.flush()

    svc = SettingsService(session)
    tmpl_name = (
        (await svc.get_app_setting("whatsapp.report_reminder_template_name") or "").strip()
        or (getattr(settings, "whatsapp_report_reminder_template_name", None) or "").strip()
    )
    tmpl_lang = (
        (await svc.get_app_setting("whatsapp.report_reminder_template_lang") or "").strip()
        or (getattr(settings, "whatsapp_report_reminder_template_lang", None) or "").strip()
        or "en"
    )

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if phone_number_id and access_token and phone:
        result = await _send_via_meta_api(
            phone=phone,
            message=message,
            phone_number_id=phone_number_id,
            access_token=access_token,
            api_version=api_version,
            template_name=tmpl_name,
            template_lang=tmpl_lang,
            first_name=first_name,
        )
    else:
        logger.info(
            "report reminder stub user_id=%s phone_tail=%s (no meta config)",
            user.id, (phone or "")[-4:],
        )
        result = {"ok": True, "channel": "whatsapp_stub"}

    channel = result.get("channel", "unknown")
    if result.get("ok"):
        record.send_status = "stub" if channel == "whatsapp_stub" else "sent"
        record.sent_at = datetime.now(timezone.utc)
        if result.get("wa_message_id"):
            record.wa_message_id = result["wa_message_id"]
    else:
        record.send_status = "failed"
        record.send_error = (
            result.get("error") or result.get("detail") or "unknown error"
        )[:500]

    if channel != "whatsapp_stub":
        from app.services.whatsapp_log_service import log_wa_outbound
        await log_wa_outbound(
            session,
            phone=phone,
            message=message,
            message_type="report_reminder",
            result=result,
            related_user_id=user.id,
        )

    await session.flush()
    return record
