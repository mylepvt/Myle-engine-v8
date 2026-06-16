"""WhatsApp alert service for team leaders.

Handles:
- Member removed → notify leader
- Member grace requested → notify leader
- New member approved → notify leader
- Removed member replied → notify leader
- Daily team summary → all leaders at 10 PM IST
- Two-way inbound commands: status / missing / top
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.daily_report import DailyReport
from app.models.user import User
from app.services.report_eligibility import report_eligibility_conditions
from app.services.settings_service import SettingsService
from app.services.user_hierarchy import nearest_leader_for_user
from app.services.whatsapp_removal import _send_via_meta_api, get_meta_config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers — resolve template config from DB / env
# ---------------------------------------------------------------------------

async def _get_template(
    session: AsyncSession,
    db_key: str,
    env_attr: str = "",
) -> tuple[str, str]:
    """Return (template_name, template_lang) — DB first, env fallback."""
    svc = SettingsService(session)
    name_key = f"whatsapp.{db_key}_template_name"
    lang_key = f"whatsapp.{db_key}_template_lang"
    tmpl_name = (await svc.get_app_setting(name_key) or "").strip()
    if not tmpl_name and env_attr:
        tmpl_name = (getattr(settings, env_attr, None) or "").strip()
    tmpl_lang = (await svc.get_app_setting(lang_key) or "").strip() or "en"
    return tmpl_name, tmpl_lang


# ---------------------------------------------------------------------------
# Core helper — send WA to any user by phone
# ---------------------------------------------------------------------------

async def _send_wa(
    phone: str | None,
    message: str,
    session: AsyncSession,
    message_type: str = "leader_alert",
    related_user_id: int | None = None,
    template_name: str = "",
    template_lang: str = "en",
    template_params: list[dict[str, str]] | None = None,
) -> bool:
    if not phone:
        return False
    from app.services.whatsapp_log_service import log_wa_outbound
    try:
        phone_number_id, access_token, api_version = await get_meta_config(session)
        if not phone_number_id or not access_token:
            return False
        result = await _send_via_meta_api(
            phone=phone,
            message=message,
            phone_number_id=phone_number_id,
            access_token=access_token,
            api_version=api_version,
            template_name=template_name,
            template_lang=template_lang,
            template_params=template_params,
        )
        await log_wa_outbound(
            session,
            phone=phone,
            message=message,
            message_type=message_type,
            result=result,
            related_user_id=related_user_id,
        )
        return bool(result.get("ok"))
    except Exception as exc:
        logger.warning("whatsapp_leader_alerts send failed: %s", exc)
        return False


def _display(user: User) -> str:
    return (user.name or user.username or user.fbo_id or "Member").strip()


async def _get_leader(member_user_id: int, session: AsyncSession) -> User | None:
    entry = await nearest_leader_for_user(session, member_user_id)
    if entry is None:
        return None
    return await session.get(User, entry.id)


# ---------------------------------------------------------------------------
# 1. Member removed → notify leader
# ---------------------------------------------------------------------------

async def alert_leader_member_removed(
    member: User,
    removal_reason: str | None,
    session: AsyncSession,
) -> None:
    leader = await _get_leader(member.id, session)
    if leader is None or not leader.phone:
        return
    reason_line = f"\nReason: {removal_reason}" if removal_reason else ""
    msg = (
        f"Hi {_display(leader)},\n\n"
        f"Team member *{_display(member)}* has been removed from Myle.{reason_line}\n\n"
        "Please review your team's status on the app.\n\n"
        "— Myle Team"
    )
    tmpl_name, tmpl_lang = await _get_template(session, "leader_member_removed")
    await _send_wa(
        leader.phone, msg, session,
        message_type="leader_alert", related_user_id=leader.id,
        template_name=tmpl_name, template_lang=tmpl_lang,
        template_params=[
            {"type": "text", "text": _display(leader)},
            {"type": "text", "text": _display(member)},
            {"type": "text", "text": removal_reason or "Not specified"},
        ],
    )
    logger.info("leader removal alert sent leader_id=%s member_id=%s", leader.id, member.id)


# ---------------------------------------------------------------------------
# 2. Member grace requested → notify leader
# ---------------------------------------------------------------------------

async def alert_leader_grace_requested(
    member: User,
    grace_reason: str | None,
    grace_end_date: date | None,
    session: AsyncSession,
) -> None:
    leader = await _get_leader(member.id, session)
    if leader is None or not leader.phone:
        return
    reason_line = f"\nReason: {grace_reason}" if grace_reason else ""
    till_line = f"\nRequested till: {grace_end_date}" if grace_end_date else ""
    msg = (
        f"Hi {_display(leader)},\n\n"
        f"*{_display(member)}* has requested a grace period.{reason_line}{till_line}\n\n"
        "Admin will review and approve/reject on the app.\n\n"
        "— Myle Team"
    )
    tmpl_name, tmpl_lang = await _get_template(session, "leader_grace_requested")
    await _send_wa(
        leader.phone, msg, session,
        message_type="leader_alert", related_user_id=leader.id,
        template_name=tmpl_name, template_lang=tmpl_lang,
        template_params=[
            {"type": "text", "text": _display(leader)},
            {"type": "text", "text": _display(member)},
            {"type": "text", "text": grace_reason or "Not specified"},
            {"type": "text", "text": str(grace_end_date) if grace_end_date else "N/A"},
        ],
    )
    logger.info("leader grace alert sent leader_id=%s member_id=%s", leader.id, member.id)


# ---------------------------------------------------------------------------
# 3. New member approved → notify leader
# ---------------------------------------------------------------------------

async def alert_leader_new_member_approved(
    member: User,
    session: AsyncSession,
) -> None:
    leader = await _get_leader(member.id, session)
    if leader is None or not leader.phone:
        return
    msg = (
        f"Hi {_display(leader)},\n\n"
        f"New member *{_display(member)}* has been approved and added to your team.\n\n"
        "Welcome them and ensure they submit their first daily report!\n\n"
        "— Myle Team"
    )
    tmpl_name, tmpl_lang = await _get_template(session, "leader_new_member")
    await _send_wa(
        leader.phone, msg, session,
        message_type="leader_alert", related_user_id=leader.id,
        template_name=tmpl_name, template_lang=tmpl_lang,
        template_params=[
            {"type": "text", "text": _display(leader)},
            {"type": "text", "text": _display(member)},
        ],
    )
    logger.info("leader new-member alert sent leader_id=%s member_id=%s", leader.id, member.id)


# ---------------------------------------------------------------------------
# 4. Removed member replied → notify leader
# ---------------------------------------------------------------------------

async def alert_leader_member_replied(
    member_user_id: int,
    reply_text: str,
    session: AsyncSession,
) -> None:
    member = await session.get(User, member_user_id)
    if member is None:
        return
    leader = await _get_leader(member_user_id, session)
    if leader is None or not leader.phone:
        return
    msg = (
        f"Hi {_display(leader)},\n\n"
        f"Removed member *{_display(member)}* replied to their removal message:\n\n"
        f'"{reply_text[:300]}"\n\n'
        "You can view the full reply in Team Tracking on the app.\n\n"
        "— Myle Team"
    )
    await _send_wa(leader.phone, msg, session, message_type="leader_alert", related_user_id=leader.id)
    logger.info("leader reply-forward sent leader_id=%s member_id=%s", leader.id, member_user_id)


# ---------------------------------------------------------------------------
# 5. Daily team summary — called per leader from scheduled job
# ---------------------------------------------------------------------------

async def send_daily_team_summary(leader: User, today: date, session: AsyncSession) -> None:
    if not leader.phone:
        return

    # Get all active direct/indirect downline members
    from app.services.downline import recursive_downline_user_ids
    downline_ids = await recursive_downline_user_ids(session, leader.id)
    if not downline_ids:
        return

    members = (
        await session.execute(
            select(User).where(
                User.id.in_(downline_ids),
                *report_eligibility_conditions(today, roles=("team",)),
            )
        )
    ).scalars().all()

    if not members:
        return

    member_ids = [m.id for m in members]

    submitted_ids = {
        int(uid)
        for (uid,) in (
            await session.execute(
                select(DailyReport.user_id).where(
                    DailyReport.user_id.in_(member_ids),
                    DailyReport.report_date == today,
                )
            )
        ).all()
    }

    submitted_count = len(submitted_ids)
    missing = [m for m in members if m.id not in submitted_ids]
    total = len(members)

    if not missing:
        msg = (
            f"Hi {_display(leader)},\n\n"
            f"Great news! All {total} team members submitted their daily report today. \U0001f389\n\n"
            "— Myle Team"
        )
        tmpl_name, tmpl_lang = await _get_template(session, "daily_team_summary_all_clear")
        await _send_wa(
            leader.phone, msg, session,
            message_type="leader_alert", related_user_id=leader.id,
            template_name=tmpl_name, template_lang=tmpl_lang,
            template_params=[
                {"type": "text", "text": _display(leader)},
                {"type": "text", "text": str(total)},
            ],
        )
    else:
        missing_names = ", ".join(_display(m) for m in missing[:5])
        more = f" +{len(missing) - 5} more" if len(missing) > 5 else ""
        msg = (
            f"Hi {_display(leader)},\n\n"
            f"Today's team report summary:\n"
            f"✅ Submitted: {submitted_count}/{total}\n"
            f"❌ Missing: {len(missing)}/{total}\n\n"
            f"Missing: {missing_names}{more}\n\n"
            "Please follow up with them.\n\n"
            "— Myle Team"
        )
        tmpl_name, tmpl_lang = await _get_template(session, "daily_team_summary")
        await _send_wa(
            leader.phone, msg, session,
            message_type="leader_alert", related_user_id=leader.id,
            template_name=tmpl_name, template_lang=tmpl_lang,
            template_params=[
                {"type": "text", "text": _display(leader)},
                {"type": "text", "text": str(submitted_count)},
                {"type": "text", "text": str(total)},
                {"type": "text", "text": f"{missing_names}{more}"},
            ],
        )
    logger.info(
        "daily summary sent leader_id=%s submitted=%d missing=%d",
        leader.id, submitted_count, len(missing),
    )


# ---------------------------------------------------------------------------
# 6. Two-way inbound command handler
# ---------------------------------------------------------------------------

async def handle_leader_command(
    phone: str,
    text: str,
    session: AsyncSession,
) -> str | None:
    """
    If the sender is a leader, parse their WhatsApp message as a command.
    Returns reply text, or None if not a recognized command / not a leader.
    """
    from app.services.whatsapp_removal import _whatsapp_digits
    from app.services.downline import recursive_downline_user_ids
    from app.core.time_ist import today_ist

    digits = _whatsapp_digits(phone)
    if not digits:
        return None

    leader = (
        await session.execute(
            select(User).where(
                User.phone.isnot(None),
                User.role == "leader",
                User.registration_status == "approved",
                User.removed_at.is_(None),
            )
        )
    ).scalars().all()

    matched_leader: User | None = None
    for u in leader:
        u_digits = _whatsapp_digits(u.phone)
        if u_digits and u_digits == digits:
            matched_leader = u
            break

    if matched_leader is None:
        return None

    cmd = text.strip().lower().lstrip("/")
    if cmd not in {"status", "missing", "top"}:
        return None

    downline_ids = await recursive_downline_user_ids(session, matched_leader.id)
    if not downline_ids:
        return f"Hi {_display(matched_leader)}, your team has no members yet."

    members = (
        await session.execute(
            select(User).where(
                User.id.in_(downline_ids),
                *report_eligibility_conditions(roles=("team",)),
            )
        )
    ).scalars().all()

    if not members:
        return f"Hi {_display(matched_leader)}, no active team members found."

    today = today_ist()
    member_ids = [m.id for m in members]
    submitted_ids = {
        int(uid)
        for (uid,) in (
            await session.execute(
                select(DailyReport.user_id).where(
                    DailyReport.user_id.in_(member_ids),
                    DailyReport.report_date == today,
                )
            )
        ).all()
    }

    if cmd == "status":
        submitted = len(submitted_ids)
        missing = len(members) - submitted
        return (
            f"Hi {_display(matched_leader)}, here's your team status for today:\n\n"
            f"✅ Reports submitted: {submitted}/{len(members)}\n"
            f"❌ Reports missing: {missing}/{len(members)}\n\n"
            "Reply *missing* to see who hasn't submitted.\n"
            "Reply *top* to see top performers this week.\n\n"
            "— Myle Team"
        )

    if cmd == "missing":
        missing_members = [m for m in members if m.id not in submitted_ids]
        if not missing_members:
            return f"Hi {_display(matched_leader)}, all team members submitted today's report! \U0001f389"
        names = "\n".join(f"• {_display(m)}" for m in missing_members[:10])
        more = f"\n...and {len(missing_members) - 10} more" if len(missing_members) > 10 else ""
        return (
            f"Hi {_display(matched_leader)}, members who haven't submitted today:\n\n"
            f"{names}{more}\n\n"
            "— Myle Team"
        )

    if cmd == "top":
        # Get last 7 days report counts
        from datetime import timedelta
        week_ago = date(today.year, today.month, today.day)
        from datetime import timedelta as td
        week_ago = today - td(days=6)
        counts_rows = (
            await session.execute(
                select(DailyReport.user_id, DailyReport.report_date).where(
                    DailyReport.user_id.in_(member_ids),
                    DailyReport.report_date >= week_ago,
                    DailyReport.report_date <= today,
                )
            )
        ).all()
        count_map: dict[int, int] = {}
        for uid, _ in counts_rows:
            count_map[int(uid)] = count_map.get(int(uid), 0) + 1
        ranked = sorted(members, key=lambda m: count_map.get(m.id, 0), reverse=True)[:5]
        lines = "\n".join(
            f"{i+1}. {_display(m)} — {count_map.get(m.id, 0)}/7 days"
            for i, m in enumerate(ranked)
        )
        return (
            f"Hi {_display(matched_leader)}, top performers this week:\n\n"
            f"{lines}\n\n"
            "— Myle Team"
        )

    return None


# ---------------------------------------------------------------------------
# EOS system alerts — automation rules & verification escalations
# ---------------------------------------------------------------------------

async def send_system_alert(
    phone: str | None,
    message: str,
    session: AsyncSession,
    message_type: str = "automation_alert",
    related_user_id: int | None = None,
) -> bool:
    """Send a plain-text system alert (automation rule / escalation) to any phone."""
    if not phone:
        return False
    tmpl_name, tmpl_lang = await _get_template(session, "system_alert")
    return await _send_wa(
        phone, message, session,
        message_type=message_type, related_user_id=related_user_id,
        template_name=tmpl_name, template_lang=tmpl_lang,
        template_params=[{"type": "text", "text": message}] if tmpl_name else None,
    )
