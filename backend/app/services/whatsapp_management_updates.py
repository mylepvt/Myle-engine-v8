"""WhatsApp management updates — sends daily/weekly/alert summaries
to the management team (e.g. Shikha) with top performers, integrity flags,
inactive members, and elite-at-risk alerts.

Uses the existing performer_insights_service + Meta Cloud API for delivery.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST, today_ist
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User
from app.services.performer_insights_service import PerformerInsightsService
from app.services.whatsapp_log_service import log_wa_outbound
from app.services.whatsapp_removal import get_meta_config
from app.services.whatsapp_report_reminder import _send_via_meta_api as send_wa
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)

# ── Management phone (saved in app settings for flexibility) ──────────
SETTING_KEY_PHONE = "whatsapp.management_phone"
SETTING_KEY_DAILY = "whatsapp.management_daily_enabled"
SETTING_KEY_WEEKLY = "whatsapp.management_weekly_enabled"
SETTING_KEY_ALERTS = "whatsapp.management_alerts_enabled"

_TIER_EMOJI = {
    "elite": "🔥", "strong": "💪", "rising": "📈",
    "developing": "🌱", "inactive": "⚪",
}


async def get_management_phone(session: AsyncSession) -> str | None:
    svc = SettingsService(session)
    return await svc.get_app_setting(SETTING_KEY_PHONE)


async def set_management_phone(session: AsyncSession, phone: str) -> None:
    svc = SettingsService(session)
    await svc.update_app_setting(SETTING_KEY_PHONE, phone, updated_by_user_id=0)


async def _toggle_enabled(session: AsyncSession, key: str) -> bool:
    """Management updates are ON by default (opt-out).

    The toggle keys are only ever read here — nothing in the app writes them
    (there is no UI/endpoint to turn them on). Treating "unset" as disabled
    silently blocked every automatic update to management. So an update is
    only considered disabled when the setting is explicitly set to a falsy
    value; otherwise it stays enabled.
    """
    svc = SettingsService(session)
    val = await svc.get_app_setting(key)
    if val is None or not val.strip():
        return True
    return val.strip().lower() not in ("0", "false", "no", "off", "disabled")


async def _send_wa_message(
    session: AsyncSession,
    phone: str,
    message: str,
    message_type: str = "management_update",
    related_user_id: int | None = None,
) -> dict[str, Any]:
    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        result = {"ok": False, "error": "Meta API not configured"}
        await log_wa_outbound(session, phone=phone, message=message, message_type=message_type, result=result, related_user_id=related_user_id)
        return result

    # WhatsApp has a ~4096 char limit; truncate with a note if needed
    MAX_WHATSAPP_LEN = 4096
    if len(message) > MAX_WHATSAPP_LEN:
        message = message[: MAX_WHATSAPP_LEN - 100] + f"\n\n...truncated ({len(message)} chars total)"

    result = await send_wa(
        phone=phone,
        message=message,
        phone_number_id=phone_number_id,
        access_token=access_token,
        api_version=api_version,
    )
    await log_wa_outbound(session, phone=phone, message=message, message_type=message_type, result=result, related_user_id=related_user_id)
    return result


# ── Message Builders ─────────────────────────────────────────────────


async def build_top5_daily(session: AsyncSession, days: int = 1) -> str:
    """Today's top 5 performers summary."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=days, min_reports=1)
    performers = insights.get("performers", [])
    top = performers[:5]

    if not top:
        return "📊 *Today's Update*\n\nNo reports submitted today yet."

    yesterday = (today_ist() - timedelta(days=1)).strftime("%d %b")
    lines = [f"📊 *Top Performers — {yesterday}*\n"]
    for i, p in enumerate(top, 1):
        emoji = _TIER_EMOJI.get(p.get("tier", ""), "👤")
        calls = p["metrics"]["total_calls"]
        pipeline = p["metrics"]["pipeline_total"]
        payments = p["metrics"]["payments"]
        score = p["composite_score"]
        lines.append(
            f"{i}. {emoji} *{p['name']}* — {score} pts\n"
            f"   📞 {calls} calls | 🔄 {pipeline} pipeline | ₹{payments} payments"
        )

    lines.append(f"\n👥 Active: {insights['active_members']}/{insights['total_members']} members")
    return "\n".join(lines)


async def build_integrity_alert(session: AsyncSession, days: int = 1) -> str | None:
    """Alert if anyone faked calls today."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=days, min_reports=0)
    flagged = insights.get("integrity_audit", {}).get("flagged_members", [])
    if not flagged:
        return None

    lines = ["⚠️ *Integrity Alert — Call Gaming Detected*\n"]
    for m in flagged[:5]:
        lines.append(
            f"• *{m['name']}* ({m['fbo_id']})\n"
            f"  Reported: {m['reported_calls']} calls | System: {m['actual_calls']}\n"
            f"  Discrepancy: +{m['discrepancy']} ({m['discrepancy_pct']}%) | Trust: {m['trust_score']}%"
        )
    if len(flagged) > 5:
        lines.append(f"\n...and {len(flagged) - 5} more flagged members")
    return "\n".join(lines)


async def build_inactive_list(session: AsyncSession, days: int = 1) -> str | None:
    """List members who didn't submit report today — direct DB query."""
    today = today_ist()
    day_start = datetime(today.year, today.month, today.day, tzinfo=IST)
    day_end = day_start + timedelta(days=1)

    # All active team/leader members
    all_members = (
        await session.execute(
            select(User.id, User.name, User.fbo_id).where(
                User.role.in_(["team", "leader"]),
                User.registration_status == "approved",
                User.access_blocked.is_(False),
                User.removed_at.is_(None),
            ).order_by(User.name)
        )
    ).all()

    # Who submitted report today
    submitters = (
        await session.execute(
            select(DailyReport.user_id).where(
                DailyReport.report_date == today,
            ).distinct()
        )
    ).scalars().all()
    submitter_set = set(submitters)

    inactive = [m for m in all_members if m.id not in submitter_set]
    if not inactive:
        return None

    # Build message — keep under WhatsApp 4096 char limit
    MAX_MSG_LEN = 4000
    lines = [
        f"📋 *Inactive Members — {today.strftime('%d %b')}*\n",
        f"Total: {len(all_members)} members",
        f"✅ Submitted: {len(submitter_set)}",
        f"❌ Missing: {len(inactive)}\n",
    ]
    for m in inactive:
        line = f"• {m.name or f'User #{m.id}'} ({m.fbo_id or '—'})"
        candidate = "\n".join(lines + [line])
        if len(candidate) > MAX_MSG_LEN:
            added_so_far = len(lines) - 4  # subtract header lines
            remaining = len(inactive) - added_so_far
            lines.append(f"...and {remaining} more (message limit reached)")
            break
        lines.append(line)

    return "\n".join(lines)


async def build_elite_at_risk_alert(session: AsyncSession) -> str | None:
    """Alert if any elite/strong members are at risk of inactivity."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=30, min_reports=0)
    at_risk = insights.get("elite_at_risk", {}).get("members", [])
    if not at_risk:
        return None

    high = [m for m in at_risk if m["risk_level"] == "high"]
    medium = [m for m in at_risk if m["risk_level"] == "medium"]

    lines = ["🚨 *Elite at Risk — Top Performers Going Inactive*\n"]
    if high:
        lines.append("🔴 *HIGH RISK — Immediate attention:*")
        for m in high:
            lines.append(
                f"• {m['name']} ({m['fbo_id']}) — {m['days_since_activity']}d inactive\n"
                f"  Score: {m['composite_score']} | Grace: {m['grace_risk']}"
            )
        lines.append("")
    if medium:
        lines.append("🟡 *MEDIUM RISK — Check in soon:*")
        for m in medium:
            lines.append(f"• {m['name']} ({m['fbo_id']}) — {m['days_since_activity']}d inactive")

    lines.append("\n💡 *Suggested actions:*")
    lines.append("• Send a WhatsApp check-in")
    lines.append("• Call them personally")
    lines.append("• Assign a buddy to re-engage")

    return "\n".join(lines)


async def build_weekly_report(session: AsyncSession) -> str:
    """Monday morning weekly summary — top 10 + key metrics."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=7, min_reports=1)
    performers = insights.get("performers", [])
    top = performers[:10]
    audit = insights.get("integrity_audit", {})
    at_risk = insights.get("elite_at_risk", {})

    start = insights.get("period_start", "")[:10]
    end = insights.get("period_end", "")[:10]

    lines = [f"📆 *Weekly Performance Report*\n{start} → {end}\n"]

    if top:
        lines.append("🏆 *TOP 10 PERFORMERS*")
        for i, p in enumerate(top, 1):
            tier_em = _TIER_EMOJI.get(p.get("tier", ""), "")
            lines.append(
                f"{i}. {tier_em} {p['name']} — {p['composite_score']}/100\n"
                f"   📞 {p['metrics']['total_calls']} calls | "
                f"🔄 {p['metrics']['pipeline_total']} pipeline | "
                f"💰 {p['metrics']['payments']} payments"
            )
        lines.append("")

    lines.append("📊 *KEY METRICS*")
    lines.append(f"• Total members: {insights['total_members']}")
    lines.append(f"• Active reporters: {insights['active_members']}")
    lines.append(f"• Average score: {insights['average_score']}")
    lines.append(f"• Top performers: {insights['top_performer_count']}")

    if audit.get("total_flagged"):
        lines.append(f"\n⚠️ *Integrity Flags:* {audit['total_flagged']} members flagged")
        lines.append(f"   Avg trust score: {audit['average_trust_score']}%")

    if at_risk.get("total_at_risk"):
        lines.append(f"\n🚨 *Elite at Risk:* {at_risk['total_at_risk']} members")

    lines.append("\n— Myle Bot")
    return "\n".join(lines)


async def build_lead_activity_daily(session: AsyncSession) -> str:
    """Who claimed leads today, who didn't, who claimed but didn't call."""
    today = today_ist()
    day_start = datetime(today.year, today.month, today.day, tzinfo=IST)
    day_end = day_start + timedelta(days=1)

    # 1) Who claimed leads today
    claim_rows = (
        await session.execute(
            select(
                ActivityLog.user_id,
                func.count(ActivityLog.id).label("claim_count"),
            ).where(
                ActivityLog.action.in_(["lead.claimed", "lead.claimed_free"]),
                ActivityLog.created_at >= day_start,
                ActivityLog.created_at < day_end,
            ).group_by(ActivityLog.user_id)
        )
    ).all()
    claim_map: dict[int, int] = {r.user_id: r.claim_count for r in claim_rows}

    # 2) All active team/leader users
    active_users = (
        await session.execute(
            select(User).where(
                User.role.in_(["team", "leader"]),
                User.registration_status == "approved",
                User.access_blocked.is_(False),
                User.removed_at.is_(None),
            ).order_by(User.name)
        )
    ).scalars().all()

    # 3) Who called on their claimed leads today
    called_on_claimed = set()
    if claim_map:
        called_rows = (
            await session.execute(
                select(CallEvent.user_id.distinct()).where(
                    CallEvent.called_at >= day_start,
                    CallEvent.called_at < day_end,
                    CallEvent.user_id.in_(list(claim_map.keys())),
                )
            )
        ).scalars().all()
        called_on_claimed = set(called_rows)

    # 4) Build message
    lines = ["📞 *Lead Activity — Today*\n"]

    claimers = sorted(claim_map.items(), key=lambda x: x[1], reverse=True)
    if claimers:
        lines.append("✅ *Claimed Leads:*")
        for uid, count in claimers:
            user = next((u for u in active_users if u.id == uid), None)
            name = user.name if user else f"User #{uid}"
            called = "📞" if uid in called_on_claimed else "⚠️ No calls"
            lines.append(f"  • {name} — {count} leads {called}")
        lines.append("")

    not_claimed = [u for u in active_users if u.id not in claim_map]
    if not_claimed:
        lines.append(f"❌ *Did NOT Claim Today ({len(not_claimed)} members):*")
        for u in not_claimed[:15]:
            lines.append(f"  • {u.name or f'User #{u.id}'} ({u.fbo_id or u.role})")
        if len(not_claimed) > 15:
            lines.append(f"  ...and {len(not_claimed) - 15} more")
        lines.append("")

    claimed_no_calls = [uid for uid in claim_map if uid not in called_on_claimed]
    if claimed_no_calls:
        lines.append(f"⚠️ *Claimed but No Calls ({len(claimed_no_calls)} members):*")
        for uid in claimed_no_calls[:10]:
            user = next((u for u in active_users if u.id == uid), None)
            name = user.name if user else f"User #{uid}"
            lines.append(f"  • {name} — {claim_map[uid]} leads claimed, 0 calls")
        if len(claimed_no_calls) > 10:
            lines.append(f"  ...and {len(claimed_no_calls) - 10} more")
        lines.append("")

    total_active = len(active_users)
    total_claimed = sum(claim_map.values())
    lines.append(f"📊 Summary: {len(claimers)}/{total_active} members claimed {total_claimed} leads")
    return "\n".join(lines)


# ── Unified send function ────────────────────────────────────────────


_TOGGLE_MAP: dict[str, str] = {
    "daily": SETTING_KEY_DAILY,
    "integrity": SETTING_KEY_DAILY,
    "inactive": SETTING_KEY_DAILY,
    "leads": SETTING_KEY_DAILY,
    "weekly": SETTING_KEY_WEEKLY,
    "elite_alert": SETTING_KEY_ALERTS,
}


async def send_management_update(
    session: AsyncSession,
    update_type: str,
    phone: str | None = None,
) -> dict[str, Any]:
    """Send a management update to Shikha (or configured phone).

    update_type: 'daily', 'integrity', 'inactive', 'elite_alert', 'weekly'
    """
    toggle_key = _TOGGLE_MAP.get(update_type)
    if toggle_key and not await _toggle_enabled(session, toggle_key):
        return {"ok": False, "error": f"{update_type} updates are disabled via settings", "sent": False}

    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}

    builders = {
        "daily": ("📊 Daily Top 5", build_top5_daily),
        "integrity": ("⚠️ Integrity Alert", build_integrity_alert),
        "inactive": ("📋 Inactive Members", build_inactive_list),
        "elite_alert": ("🚨 Elite at Risk", build_elite_at_risk_alert),
        "weekly": ("📆 Weekly Report", build_weekly_report),
        "leads": ("📞 Lead Activity", None),
    }

    label, builder_fn = builders.get(update_type, (None, None))
    if not builder_fn and update_type != "leads":
        return {"ok": False, "error": f"Unknown update type: {update_type}"}

    if update_type == "leads":
        message = await build_lead_activity_daily(session)
    elif update_type == "weekly":
        message = await builder_fn(session)
    elif update_type == "elite_alert":
        message = await builder_fn(session)
    else:
        days = 1 if update_type in ("daily", "integrity", "inactive") else 7
        message = await builder_fn(session, days=days)

    if not message:
        return {"ok": True, "info": f"No {label} data to send", "sent": False}

    result = await _send_wa_message(session, phone, message)
    result["label"] = label
    result["sent"] = result.get("ok", False)
    return result


async def send_daily_management_bundle(session: AsyncSession) -> list[dict[str, Any]]:
    """Send the full daily bundle: top 5 + integrity + inactive."""
    phone = await get_management_phone(session)
    if not phone:
        return [{"ok": False, "error": "No management phone configured"}]

    results = []
    for ut in ("daily", "integrity", "inactive", "leads"):
        r = await send_management_update(session, ut, phone)
        results.append(r)
    return results


# ── Instant alerts for real-time events ─────────────────────────────


async def send_management_member_removed_alert(
    session: AsyncSession,
    member_name: str,
    member_fbo: str,
    removed_by: str,
    reason: str,
    leader_name: str = "",
    phone: str | None = None,
) -> dict[str, Any]:
    """Notify management when a member is removed."""
    if not await _toggle_enabled(session, SETTING_KEY_ALERTS):
        return {"ok": False, "error": "Instant alerts are disabled", "sent": False}
    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}

    lines = [
        "🚨 *Member Removed*\n",
        f"👤 *{member_name}* ({member_fbo})",
        f"❌ Removed by: {removed_by}",
        f"📝 Reason: {reason}",
    ]
    if leader_name:
        lines.append(f"👔 Leader: {leader_name}")
    lines.append(f"\n🕐 {datetime.now(timezone.utc).astimezone().strftime('%d %b %I:%M %p')}")

    return await _send_wa_message(session, phone, "\n".join(lines), message_type="member_removed")


async def send_management_member_approved_alert(
    session: AsyncSession,
    member_name: str,
    member_fbo: str,
    approved_by: str,
    leader_name: str = "",
    phone: str | None = None,
) -> dict[str, Any]:
    """Notify management when a new member is approved."""
    if not await _toggle_enabled(session, SETTING_KEY_ALERTS):
        return {"ok": False, "error": "Instant alerts are disabled", "sent": False}
    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}

    lines = [
        "✅ *New Member Approved*\n",
        f"👤 *{member_name}* ({member_fbo})",
        f"✔️ Approved by: {approved_by}",
    ]
    if leader_name:
        lines.append(f"👔 Under leader: {leader_name}")
    lines.append(f"\n🕐 {datetime.now(timezone.utc).astimezone().strftime('%d %b %I:%M %p')}")

    return await _send_wa_message(session, phone, "\n".join(lines), message_type="member_approved")


async def send_management_grace_requested_alert(
    session: AsyncSession,
    member_name: str,
    member_fbo: str,
    reason: str,
    end_date: str,
    phone: str | None = None,
) -> dict[str, Any]:
    """Notify management when a member requests grace."""
    if not await _toggle_enabled(session, SETTING_KEY_ALERTS):
        return {"ok": False, "error": "Instant alerts are disabled", "sent": False}
    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}
    lines = [
        "🙏 *Grace Requested*\n",
        f"👤 *{member_name}* ({member_fbo})",
        f"📝 Reason: {reason or 'Not specified'}",
        f"📅 Till: {end_date}",
        f"\n🕐 {datetime.now(timezone.utc).astimezone().strftime('%d %b %I:%M %p')}",
    ]
    return await _send_wa_message(session, phone, "\n".join(lines), message_type="grace_requested")


async def send_management_grace_decision_alert(
    session: AsyncSession,
    member_name: str,
    member_fbo: str,
    action: str,  # approved / rejected / granted
    decided_by: str,
    phone: str | None = None,
) -> dict[str, Any]:
    """Notify management when a grace request is approved/rejected by admin."""
    if not await _toggle_enabled(session, SETTING_KEY_ALERTS):
        return {"ok": False, "error": "Instant alerts are disabled", "sent": False}
    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}
    emoji = "✅" if action in ("approved", "granted") else "❌"
    label = "Grace Approved" if action in ("approved", "granted") else "Grace Rejected"
    lines = [
        f"{emoji} *{label}*\n",
        f"👤 *{member_name}* ({member_fbo})",
        f"👤 By: {decided_by}",
        f"\n🕐 {datetime.now(timezone.utc).astimezone().strftime('%d %b %I:%M %p')}",
    ]
    return await _send_wa_message(session, phone, "\n".join(lines), message_type="grace_decision")


async def send_management_final_warning_alert(
    session: AsyncSession,
    member_name: str,
    member_fbo: str,
    reason: str,
    streak_days: int,
    phone: str | None = None,
) -> dict[str, Any]:
    """Notify management when a member hits final warning (about to be removed)."""
    if not await _toggle_enabled(session, SETTING_KEY_ALERTS):
        return {"ok": False, "error": "Instant alerts are disabled", "sent": False}
    if not phone:
        phone = await get_management_phone(session)
    if not phone:
        return {"ok": False, "error": "No management phone configured"}
    lines = [
        "⚠️ *Final Warning — Immediate Attention*\n",
        f"👤 *{member_name}* ({member_fbo})",
        f"📝 Issue: {reason}",
        f"📊 Streak: {streak_days} days",
        f"\n⏳ Next step: auto-removal if not corrected",
        f"\n🕐 {datetime.now(timezone.utc).astimezone().strftime('%d %b %I:%M %p')}",
    ]
    return await _send_wa_message(session, phone, "\n".join(lines), message_type="final_warning")
