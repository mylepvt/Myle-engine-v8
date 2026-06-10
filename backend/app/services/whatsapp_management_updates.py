"""WhatsApp management updates — sends daily/weekly/alert summaries
to the management team (e.g. Shikha) with top performers, integrity flags,
inactive members, and elite-at-risk alerts.

Uses the existing performer_insights_service + Meta Cloud API for delivery.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_report import DailyReport
from app.models.user import User
from app.services.performer_insights_service import PerformerInsightsService
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
    return await svc.get_setting(SETTING_KEY_PHONE)


async def set_management_phone(session: AsyncSession, phone: str) -> None:
    svc = SettingsService(session)
    await svc.set_setting(SETTING_KEY_PHONE, phone)


async def _get_meta_config(session: AsyncSession) -> dict[str, Any]:
    svc = SettingsService(session)
    pid = await svc.get_setting("whatsapp.phone_number_id")
    token = await svc.get_setting("whatsapp.access_token")
    ver = await svc.get_setting("whatsapp.api_version") or "v22.0"
    return {
        "phone_number_id": pid or "",
        "access_token": token or "",
        "api_version": ver,
    }


async def _send_wa_message(session: AsyncSession, phone: str, message: str) -> dict[str, Any]:
    cfg = await _get_meta_config(session)
    if not cfg["phone_number_id"] or not cfg["access_token"]:
        return {"ok": False, "error": "Meta API not configured"}
    return await send_wa(
        phone=phone,
        message=message,
        phone_number_id=cfg["phone_number_id"],
        access_token=cfg["access_token"],
        api_version=cfg["api_version"],
    )


# ── Message Builders ─────────────────────────────────────────────────


async def build_top5_daily(session: AsyncSession, days: int = 1) -> str:
    """Today's top 5 performers summary."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=days, min_reports=1)
    performers = insights.get("performers", [])
    top = performers[:5]

    if not top:
        return "📊 *Today's Update*\n\nNo reports submitted today yet."

    yesterday = (date.today() - timedelta(days=1)).strftime("%d %b")
    lines = [f"📊 *Top Performers — {yesterday}*\n"]
    for i, p in enumerate(top, 1):
        emoji = _TIER_EMOJI.get(p.get("tier", ""), "👤")
        calls = p["metrics"]["total_calls"]
        pipeline = p["metrics"]["pipeline_total"]
        payments = p["metrics"]["payments"]
        score = p["composite_score"]
        lines.append(
            f"{i}. {emoji} *{p['name']}* — {score} pts\n"
            f"   📞 {calls} calls | 🔄 {pipeline} pipeline | ₹ payments"
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
    """List members who didn't submit report today."""
    svc = PerformerInsightsService(session)
    insights = await svc.get_performer_insights(days=days, min_reports=0)
    inactive_count = insights.get("tier_distribution", {}).get("inactive", 0)
    if inactive_count == 0:
        return None

    # Get inactive members directly
    inactive = [p for p in insights.get("performers", []) if p.get("tier") == "inactive"]

    total_members = insights["total_members"]
    active = insights["active_members"]
    lines = [
        f"📋 *Inactive Members — Today*\n",
        f"Total: {total_members} members",
        f"✅ Submitted: {active}",
        f"❌ Missing: {inactive_count}\n",
    ]
    if inactive:
        names = [f"• {p['name']} ({p['fbo_id']})" for p in inactive[:10]]
        lines.extend(names)
        if len(inactive) > 10:
            lines.append(f"...and {len(inactive) - 10} more")
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


# ── Unified send function ────────────────────────────────────────────


async def send_management_update(
    session: AsyncSession,
    update_type: str,
    phone: str | None = None,
) -> dict[str, Any]:
    """Send a management update to Shikha (or configured phone).

    update_type: 'daily', 'integrity', 'inactive', 'elite_alert', 'weekly'
    """
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
    }

    label, builder_fn = builders.get(update_type, (None, None))
    if not builder_fn:
        return {"ok": False, "error": f"Unknown update type: {update_type}"}

    days = 1 if update_type in ("daily", "integrity", "inactive") else 30 if update_type == "elite_alert" else 7
    if update_type == "weekly":
        message = await builder_fn(session)
    elif update_type == "elite_alert":
        message = await builder_fn(session)
    else:
        message = await builder_fn(session, days=days)

    if not message:
        return {"ok": True, "info": f"No {label} data to send", "sent": False}

    result = await _send_wa_message(session, phone, message)
    result["label"] = label
    return result


async def send_daily_management_bundle(session: AsyncSession) -> list[dict[str, Any]]:
    """Send the full daily bundle: top 5 + integrity + inactive."""
    phone = await get_management_phone(session)
    if not phone:
        return [{"ok": False, "error": "No management phone configured"}]

    results = []
    for ut in ("daily", "integrity", "inactive"):
        r = await send_management_update(session, ut, phone)
        results.append(r)
    return results
