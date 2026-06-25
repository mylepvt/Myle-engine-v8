"""WhatsApp reminders for leaders who haven't submitted today's tracking report.

The "tracking report" is the CURRENT CCs v/s TARGET CCs daily sheet
(``current_cc_sheets``). This nudges a leader, at night, only if they have not
saved their own sheet for the day. Mirrors the daily-report reminder pattern in
``whatsapp_report_reminder`` (approved template outside the 24h window, free-form
text fallback inside it).
"""
from __future__ import annotations

import logging
import random
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.services.settings_service import SettingsService
from app.services.whatsapp_report_reminder import _send_via_meta_api
from app.services.whatsapp_removal import get_meta_config

logger = logging.getLogger(__name__)


_REMINDER_VARIANTS = [
    (
        "Hi {first_name},\n\n"
        "Aapne aaj ki tracking report submit kr di k nhi? ⏰\n\n"
        "Agar abhi tak nahi ki, to Myle dashboard se apni tracking report submit kar lein.\n\n"
        "— Myle Team"
    ),
    (
        "Hey {first_name}! 👋\n\n"
        "Aapne aaj ki tracking report submit ki ya nahi?\n\n"
        "Agar pending hai to abhi complete kar lo — Myle app → Tracking Report.\n\n"
        "— Myle Team"
    ),
    (
        "Hi {first_name},\n\n"
        "Reminder: aaj ki tracking report submit ki k nhi? 📋\n\n"
        "Ek baar Myle dashboard check karke submit kar dena. 💪\n\n"
        "— Myle Team"
    ),
]


def build_tracking_reminder_message(*, leader_name: str) -> str:
    first_name = (leader_name or "there").strip().split()[0]
    template = random.choice(_REMINDER_VARIANTS)
    return template.format(first_name=first_name)


async def send_tracking_report_reminder(
    *,
    user: User,
    reminder_date: date,
    session: AsyncSession,
) -> dict[str, Any]:
    """Send a WhatsApp nudge asking the leader to submit today's tracking report.

    Defence-in-depth: skips anyone the messaging gate says should not get
    automated nudges (removed/blocked/not approved/onboarding) even though the
    scheduled caller already filters on eligibility.
    """
    from app.services.messaging_gate import (
        automated_block_reason,
        can_receive_automated_message,
    )

    if not can_receive_automated_message(user):
        reason = automated_block_reason(user) or "not_eligible"
        logger.info("tracking reminder skipped user_id=%s (%s)", user.id, reason)
        return {"ok": False, "skipped": True, "reason": reason}

    phone = getattr(user, "phone", None)
    if not phone:
        return {"ok": False, "skipped": True, "reason": "no_phone"}

    leader_name = (
        (user.name or "").strip()
        or (getattr(user, "username", None) or "").strip()
        or user.fbo_id
        or "Leader"
    )
    first_name = leader_name.strip().split()[0]
    message = build_tracking_reminder_message(leader_name=leader_name)

    svc = SettingsService(session)
    tmpl_name = (
        (await svc.get_app_setting("whatsapp.tracking_reminder_template_name") or "").strip()
        or (getattr(settings, "whatsapp_tracking_reminder_template_name", None) or "").strip()
    )
    tmpl_lang = (
        (await svc.get_app_setting("whatsapp.tracking_reminder_template_lang") or "").strip()
        or (getattr(settings, "whatsapp_tracking_reminder_template_lang", None) or "").strip()
        or "en"
    )

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if phone_number_id and access_token:
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
            "tracking reminder stub user_id=%s phone_tail=%s (no meta config)",
            user.id, (phone or "")[-4:],
        )
        result = {"ok": True, "channel": "whatsapp_stub"}

    if result.get("channel") != "whatsapp_stub":
        from app.services.whatsapp_log_service import log_wa_outbound
        await log_wa_outbound(
            session,
            phone=phone,
            message=message,
            message_type="tracking_reminder",
            result=result,
            related_user_id=user.id,
        )

    if result.get("ok") and result.get("channel") != "whatsapp_stub":
        result["sent_at"] = datetime.now(timezone.utc).isoformat()
    return result
