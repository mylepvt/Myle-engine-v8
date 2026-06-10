"""Intelligent performer insights — statistical engine that identifies genuine
contributors, ranks them by weighted composite score, and suggests who belongs
in a top-performer WhatsApp group."""

from __future__ import annotations

import math
import statistics
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User


# ---------------------------------------------------------------------------
# Weights — each is a fraction of the 100-point composite.
# The sum MUST be 1.0.
# ---------------------------------------------------------------------------
W = {
    "consistency": 0.15,  # report submission regularity
    "call_volume": 0.15,  # calls made per day
    "pickup_rate": 0.10,  # % of calls that were picked
    "lead_education": 0.15,  # leads educated + pdf covered
    "pipeline": 0.25,  # day1 + day2 + day3 counts
    "results": 0.20,  # actual payments collected
}

# Tier thresholds (composite score cutoffs)
TIERS = [
    ("elite", 80, "🔥 Elite — top performer, consistently delivering results"),
    ("strong", 60, "💪 Strong — reliable, good output, deserves recognition"),
    ("rising", 40, "📈 Rising — showing promise, improving steadily"),
    ("developing", 20, "🌱 Developing — early stage, needs encouragement"),
    ("inactive", 0, "⚪ Inactive — minimal or no activity"),
]

# Percentiles for auto-suggest
SUGGEST_ELITE_PCT = 90  # top 10% → elite
SUGGEST_STRONG_PCT = 70  # top 30% → strong

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _percentile_rank(values: list[float], value: float) -> float:
    """Return the percentile (0-100) of `value` within `values`."""
    if not values:
        return 0
    count_less = sum(1 for v in values if v <= value)
    return count_less / len(values) * 100


def _normalize_phone(phone: str | None) -> str:
    """Return phone with 91 prefix, stripped of non-digits."""
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    # Already has country code
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"+91{digits}"
    return f"+{digits}" if digits else ""


def _tier_for_score(score: float) -> dict:
    for label, threshold, desc in TIERS:
        if score >= threshold:
            return {"label": label, "description": desc}
    return {"label": "inactive", "description": TIERS[-1][2]}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PerformerInsightsService:
    """Statistical engine that identifies genuine contributors.

    Methodology
    ───────────
    1.  For every non-admin member we collect raw metrics over the period.
    2.  Each raw metric is converted to a 0-100 sub-score using percentile
        ranking against the *entire* member population (not arbitrary targets).
    3.  The sub-scores are weighted and summed into a **composite score** (0-100).
    4.  Members are classified into tiers by composite score.
    5.  A ``suggested_group`` is computed — the set of members who clearly
        belong in a top-performer WhatsApp group (Elite + Strong tiers).
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_performer_insights(
        self,
        days: int = 30,
        min_reports: int = 1,
    ) -> dict[str, Any]:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        period_len = max((end_date - start_date).days, 1)

        # ── 1. Load all non-admin approved members ──────────────────────────
        users_q = await self.session.execute(
            select(User).where(
                User.role.in_(["leader", "team"]),
                User.registration_status == "approved",
                User.removed_at.is_(None),
            )
        )
        users = users_q.scalars().all()
        user_map = {u.id: u for u in users}
        user_ids = [u.id for u in users]

        if not user_ids:
            return {
                "period_days": days,
                "total_members": 0,
                "performers": [],
                "suggested_group": {"elite": [], "strong": [], "total_count": 0},
            }

        # ── 2. Bulk-load reports ────────────────────────────────────────────
        reports_q = await self.session.execute(
            select(DailyReport)
            .where(
                DailyReport.user_id.in_(user_ids),
                DailyReport.report_date >= start_date,
                DailyReport.report_date <= end_date,
            )
            .order_by(DailyReport.user_id, DailyReport.report_date)
        )
        reports = reports_q.scalars().all()

        reports_by_user: dict[int, list[DailyReport]] = {}
        for r in reports:
            reports_by_user.setdefault(int(r.user_id), []).append(r)

        # ── 3. Bulk-load lead stats ─────────────────────────────────────────
        leads_q = await self.session.execute(
            select(
                Lead.assigned_to_user_id,
                func.count(Lead.id).label("total_leads"),
                func.sum(case((Lead.status == "converted", 1), else_=0)).label(
                    "converted_leads"
                ),
                func.sum(
                    case((Lead.payment_status == "approved", 1), else_=0)
                ).label("paid_leads"),
            ).where(
                Lead.assigned_to_user_id.in_(user_ids),
                Lead.deleted_at.is_(None),
                Lead.created_at
                >= datetime.combine(start_date, datetime.min.time()),
                Lead.created_at
                <= datetime.combine(end_date, datetime.max.time()),
            ).group_by(Lead.assigned_to_user_id)
        )
        lead_stats: dict[int, dict] = {}
        for row in leads_q:
            uid = int(row.assigned_to_user_id)
            lead_stats[uid] = {
                "total_leads": row.total_leads or 0,
                "converted_leads": row.converted_leads or 0,
                "paid_leads": row.paid_leads or 0,
            }

        # ── 4. Compute raw metrics for every member ─────────────────────────
        raw = []  # list of dicts with raw values + user info
        for uid in user_ids:
            user = user_map.get(uid)
            if not user:
                continue

            user_reports = reports_by_user.get(uid, [])
            report_count = len(user_reports)
            if report_count < min_reports and days > 7:
                continue

            submission_days = len({r.report_date for r in user_reports})

            if user_reports:
                total_calls = sum(r.total_calling or 0 for r in user_reports)
                calls_picked = sum(r.calls_picked or 0 for r in user_reports)
                avg_daily_calls = total_calls / period_len

                leads_educated = sum(
                    r.leads_educated or 0 for r in user_reports
                )
                pdf_covered = sum(r.pdf_covered or 0 for r in user_reports)

                day1 = sum(r.day1_count or 0 for r in user_reports)
                day2 = sum(r.day2_count or 0 for r in user_reports)
                day3 = sum(r.day3_count or 0 for r in user_reports)

                total_payments = sum(
                    r.payments_actual or 0 for r in user_reports
                )

                mid_point = len(user_reports) // 2
                if mid_point > 0 and len(user_reports) >= 4:
                    early_half = user_reports[:mid_point]
                    late_half = user_reports[mid_point:]
                    early_avg = (
                        sum(r.total_calling or 0 for r in early_half)
                        / len(early_half)
                    )
                    late_avg = (
                        sum(r.total_calling or 0 for r in late_half)
                        / len(late_half)
                    )
                    trend_pct = (
                        ((late_avg - early_avg) / early_avg * 100)
                        if early_avg > 0
                        else 0
                    )
                else:
                    trend_pct = 0
            else:
                total_calls = 0
                calls_picked = 0
                avg_daily_calls = 0
                leads_educated = 0
                pdf_covered = 0
                day1 = day2 = day3 = 0
                total_payments = 0
                trend_pct = 0

            ls = lead_stats.get(uid, {})
            raw.append(
                {
                    "user_id": uid,
                    "name": user.name or user.username or user.fbo_id or "",
                    "fbo_id": user.fbo_id or "",
                    "role": user.role,
                    "phone": _normalize_phone(user.phone),
                    "phone_raw": user.phone or "",
                    "submission_days": submission_days,
                    "total_calls": total_calls,
                    "calls_picked": calls_picked,
                    "avg_daily_calls": avg_daily_calls,
                    "pickup_rate": (
                        (calls_picked / total_calls * 100)
                        if total_calls > 0
                        else 0
                    ),
                    "leads_educated": leads_educated,
                    "pdf_covered": pdf_covered,
                    "pipeline_total": day1 + day2 + day3,
                    "payments": total_payments,
                    "leads_taken": ls.get("total_leads", 0),
                    "converted_leads": ls.get("converted_leads", 0),
                    "paid_leads": ls.get("paid_leads", 0),
                    "trend_pct": trend_pct,
                }
            )

        if not raw:
            return {
                "period_days": days,
                "total_members": len(users),
                "performers": [],
                "suggested_group": {"elite": [], "strong": [], "total_count": 0},
            }

        # ── 5. Compute sub-scores via percentile ranking ────────────────────
        def _pct(dist_key: str, raw_row: dict) -> float:
            dist = [r[dist_key] for r in raw]
            return _percentile_rank(dist, raw_row[dist_key])

        for row in raw:
            consistency_raw = (
                row["submission_days"] / period_len * 100
            )
            row["_consistency_raw"] = consistency_raw
            row["_calls_raw"] = row["avg_daily_calls"]
            row["_pickup_raw"] = row["pickup_rate"]
            row["_education_raw"] = (
                row["leads_educated"] + row["pdf_covered"]
            )
            row["_pipeline_raw"] = row["pipeline_total"]
            row["_payments_raw"] = row["payments"]

        # Build distributions (only for members with >0 activity)
        active_raw = [r for r in raw if r["submission_days"] > 0]
        for row in raw:
            active_peers = active_raw if row["submission_days"] > 0 else raw

            sub_consistency = _percentile_rank(
                [r["_consistency_raw"] for r in active_peers],
                row["_consistency_raw"],
            )
            sub_calls = _percentile_rank(
                [r["_calls_raw"] for r in active_peers], row["_calls_raw"]
            )
            sub_pickup = _percentile_rank(
                [r["_pickup_raw"] for r in active_peers], row["_pickup_raw"]
            )
            sub_education = _percentile_rank(
                [r["_education_raw"] for r in active_peers],
                row["_education_raw"],
            )
            sub_pipeline = _percentile_rank(
                [r["_pipeline_raw"] for r in active_peers],
                row["_pipeline_raw"],
            )
            sub_results = _percentile_rank(
                [r["_payments_raw"] for r in active_peers],
                row["_payments_raw"],
            )

            composite = (
                sub_consistency * W["consistency"]
                + sub_calls * W["call_volume"]
                + sub_pickup * W["pickup_rate"]
                + sub_education * W["lead_education"]
                + sub_pipeline * W["pipeline"]
                + sub_results * W["results"]
            )

            tier = _tier_for_score(composite)
            row["composite_score"] = round(composite, 1)
            row["breakdown"] = {
                "consistency": round(sub_consistency, 1),
                "call_activity": round(sub_calls, 1),
                "pickup_rate": round(sub_pickup, 1),
                "lead_education": round(sub_education, 1),
                "pipeline_conversion": round(sub_pipeline, 1),
                "results": round(sub_results, 1),
            }
            row["tier"] = tier["label"]
            row["tier_desc"] = tier["description"]
            row["trend"] = (
                "improving"
                if row["trend_pct"] > 10
                else "declining"
                if row["trend_pct"] < -10
                else "stable" if row["submission_days"] > 0
                else "inactive"
            )

        # ── 6. Sort & rank ──────────────────────────────────────────────────
        raw.sort(key=lambda r: r["composite_score"], reverse=True)
        for i, row in enumerate(raw):
            row["rank"] = i + 1

        # ── 7. Build the suggested group (who to add to WhatsApp group) ─────
        suggested_elite = [
            {
                "rank": r["rank"],
                "user_id": r["user_id"],
                "name": r["name"],
                "fbo_id": r["fbo_id"],
                "phone": r["phone"],
                "composite_score": r["composite_score"],
                "tier": r["tier"],
                "reason": f"Score {r['composite_score']} — {r['tier_desc']}",
            }
            for r in raw
            if r["tier"] == "elite"
        ]
        suggested_strong = [
            {
                "rank": r["rank"],
                "user_id": r["user_id"],
                "name": r["name"],
                "fbo_id": r["fbo_id"],
                "phone": r["phone"],
                "composite_score": r["composite_score"],
                "tier": r["tier"],
                "reason": f"Score {r['composite_score']} — {r['tier_desc']}",
            }
            for r in raw
            if r["tier"] == "strong"
        ]

        # ── 8. Format output ────────────────────────────────────────────────
        performers_out = []
        for r in raw:
            performers_out.append(
                {
                    "rank": r["rank"],
                    "user_id": r["user_id"],
                    "name": r["name"],
                    "fbo_id": r["fbo_id"],
                    "role": r["role"],
                    "phone": r["phone"],
                    "composite_score": r["composite_score"],
                    "breakdown": r["breakdown"],
                    "tier": r["tier"],
                    "tier_desc": r["tier_desc"],
                    "metrics": {
                        "submission_days": r["submission_days"],
                        "total_calls": r["total_calls"],
                        "calls_picked": r["calls_picked"],
                        "pickup_rate": round(r["pickup_rate"], 1),
                        "avg_daily_calls": round(r["avg_daily_calls"], 1),
                        "leads_educated": r["leads_educated"],
                        "pipeline_total": r["pipeline_total"],
                        "payments": r["payments"],
                        "leads_taken": r["leads_taken"],
                        "converted_leads": r["converted_leads"],
                        "paid_leads": r["paid_leads"],
                    },
                    "trend": r["trend"],
                    "trend_pct": round(r["trend_pct"], 1),
                }
            )

        active_count = sum(
            1 for r in raw if r["submission_days"] > 0
        )
        all_scores = [r["composite_score"] for r in raw]
        avg_score = (
            statistics.mean(all_scores) if all_scores else 0
        )
        median_score = (
            statistics.median(all_scores) if all_scores else 0
        )

        return {
            "period_days": days,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "total_members": len(users),
            "active_members": active_count,
            "top_performer_count": len(suggested_elite) + len(suggested_strong),
            "average_score": round(avg_score, 1),
            "median_score": round(median_score, 1),
            "tier_distribution": {
                "elite": sum(1 for r in raw if r["tier"] == "elite"),
                "strong": sum(1 for r in raw if r["tier"] == "strong"),
                "rising": sum(1 for r in raw if r["tier"] == "rising"),
                "developing": sum(1 for r in raw if r["tier"] == "developing"),
                "inactive": sum(1 for r in raw if r["tier"] == "inactive"),
            },
            "suggested_group": {
                "elite": suggested_elite,
                "strong": suggested_strong,
                "total_count": len(suggested_elite) + len(suggested_strong),
                "all_phones": list(
                    dict.fromkeys(
                        r["phone"]
                        for r in suggested_elite + suggested_strong
                        if r["phone"]
                    )
                ),
                "whatsapp_group_intro": (
                    "🏆 *Top Performers Group*\n"
                    f"Period: Last {days} days\n"
                    f"Members: {len(suggested_elite) + len(suggested_strong)}\n"
                    "Let's keep crushing it! 💪"
                ),
            },
            "performers": performers_out,
        }
