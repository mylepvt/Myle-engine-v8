"""Intelligent performer insights — statistical engine that identifies genuine
contributors, ranks them by weighted composite score, cross-checks self-reported
activity against system logs, and predicts which top performers are at risk of
going inactive."""

from __future__ import annotations

import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_event import CallEvent
from app.models.daily_report import DailyReport
from app.models.grace_history import GraceHistory
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.services.grace_intelligence import get_grace_contexts_batch
from app.services.report_eligibility import report_eligibility_conditions

# ---------------------------------------------------------------------------
# Weights — each is a fraction of the 100-point composite. Sum = 1.0.
# ---------------------------------------------------------------------------
W = {
    "consistency": 0.15,
    "call_volume": 0.15,
    "pickup_rate": 0.10,
    "lead_education": 0.15,
    "pipeline": 0.25,
    "results": 0.20,
}

TIERS = [
    ("elite", 80, "🔥 Elite — top performer, consistently delivering results"),
    ("strong", 60, "💪 Strong — reliable, good output, deserves recognition"),
    ("rising", 40, "📈 Rising — showing promise, improving steadily"),
    ("developing", 20, "🌱 Developing — early stage, needs encouragement"),
    ("inactive", 0, "⚪ Inactive — minimal or no activity"),
]

INACTIVITY_RISK_DAYS = {
    "high": 7,
    "medium": 5,
    "low": 3,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _percentile_rank(values: list[float], value: float) -> float:
    if not values:
        return 0
    count_less = sum(1 for v in values if v <= value)
    return count_less / len(values) * 100


def _normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
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
    """Statistical engine for performer intelligence.

    Capabilities
    ────────────
    1. **Performance scoring** — percentile-based composite (0-100) across 6
       weighted dimensions. Members are classified into tiers.
    2. **Integrity audit** — cross-checks self-reported call counts
       (DailyReport.total_calling) against system-logged CallEvent rows.
       A trust_score (0-100) and optional penalty are computed per member.
    3. **Elite-at-risk prediction** — monitors elite/strong members who have
       stopped submitting reports or logging calls. Combines inactivity
       duration + grace history to assign a risk level.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ──────────────────────────────────────────────────────────────────────
    # Public entry-point
    # ──────────────────────────────────────────────────────────────────────

    async def get_performer_insights(
        self,
        days: int = 30,
        min_reports: int = 1,
    ) -> dict[str, Any]:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        period_len = max((end_date - start_date).days, 1)

        # 1. Load users — only approved, active members who have finished
        # onboarding. Removed, access-blocked, and in-training (7-day gate)
        # members must never surface in performance/integrity/at-risk reports.
        users_q = await self.session.execute(
            select(User).where(*report_eligibility_conditions())
        )
        users = users_q.scalars().all()
        user_map = {u.id: u for u in users}
        user_ids = [u.id for u in users]

        if not user_ids:
            return self._empty_response(days, users)

        # 2. Bulk-load reports
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

        # 3. Bulk-load lead stats
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

        # 4. Integrity audit — bulk-load call events per user per day
        system_call_counts: dict[int, int] = {}
        audit_rows = await self.session.execute(
            select(
                CallEvent.user_id,
                func.date(CallEvent.called_at).label("call_date"),
                func.count(CallEvent.id).label("actual_calls"),
            ).where(
                CallEvent.user_id.in_(user_ids),
                CallEvent.called_at >= datetime.combine(start_date, datetime.min.time()),
                CallEvent.called_at <= datetime.combine(end_date, datetime.max.time()),
            ).group_by(CallEvent.user_id, func.date(CallEvent.called_at))
        )
        for row in audit_rows:
            uid = int(row.user_id)
            system_call_counts[uid] = (
                system_call_counts.get(uid, 0) + row.actual_calls
            )

        # 5. Compute raw metrics + integrity per member
        raw: list[dict] = []
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
                leads_educated = sum(r.leads_educated or 0 for r in user_reports)
                pdf_covered = sum(r.pdf_covered or 0 for r in user_reports)
                day1 = sum(r.day1_count or 0 for r in user_reports)
                day2 = sum(r.day2_count or 0 for r in user_reports)
                day3 = sum(r.day3_count or 0 for r in user_reports)
                total_payments = sum(r.payments_actual or 0 for r in user_reports)

                mid_point = len(user_reports) // 2
                if mid_point > 0 and len(user_reports) >= 4:
                    early_half = user_reports[:mid_point]
                    late_half = user_reports[mid_point:]
                    early_avg = sum(r.total_calling or 0 for r in early_half) / len(early_half)
                    late_avg = sum(r.total_calling or 0 for r in late_half) / len(late_half)
                    trend_pct = ((late_avg - early_avg) / early_avg * 100) if early_avg > 0 else 0
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

            # Integrity: reported vs actual calls
            actual_calls = system_call_counts.get(uid, 0)
            reported_calls = total_calls
            discrepancy = reported_calls - actual_calls
            discrepancy_pct = (
                (discrepancy / max(actual_calls, 1)) * 100
                if actual_calls > 0 or reported_calls > 0
                else 0
            )
            # Trust score: 100 = perfect match, 0 = completely fabricated
            if reported_calls == 0 and actual_calls == 0:
                trust_score = 100.0
            elif actual_calls == 0 and reported_calls > 0:
                trust_score = 0.0
            else:
                ratio = min(actual_calls, reported_calls) / max(actual_calls, reported_calls, 1)
                trust_score = ratio * 100

            ls = lead_stats.get(uid, {})
            raw.append({
                "user_id": uid,
                "name": user.name or user.username or user.fbo_id or "",
                "fbo_id": user.fbo_id or "",
                "role": user.role,
                "phone": _normalize_phone(user.phone),
                "phone_raw": user.phone or "",
                "submission_days": submission_days,
                "total_calls": total_calls,
                "actual_calls": actual_calls,
                "discrepancy": discrepancy,
                "discrepancy_pct": round(discrepancy_pct, 1),
                "trust_score": round(trust_score, 1),
                "calls_picked": calls_picked,
                "avg_daily_calls": avg_daily_calls,
                "pickup_rate": (calls_picked / total_calls * 100) if total_calls > 0 else 0,
                "leads_educated": leads_educated,
                "pdf_covered": pdf_covered,
                "pipeline_total": day1 + day2 + day3,
                "payments": total_payments,
                "leads_taken": ls.get("total_leads", 0),
                "converted_leads": ls.get("converted_leads", 0),
                "paid_leads": ls.get("paid_leads", 0),
                "trend_pct": trend_pct,
            })

        if not raw:
            return self._empty_response(days, users)

        # 6. Percentile scoring
        active_raw = [r for r in raw if r["submission_days"] > 0]
        for row in raw:
            peers = active_raw if row["submission_days"] > 0 else raw

            sub_consistency = _percentile_rank(
                [r["submission_days"] / period_len * 100 for r in peers],
                row["submission_days"] / period_len * 100,
            )
            sub_calls = _percentile_rank(
                [r["avg_daily_calls"] for r in peers],
                row["avg_daily_calls"],
            )
            sub_pickup = _percentile_rank(
                [r["pickup_rate"] for r in peers],
                row["pickup_rate"],
            )
            sub_education = _percentile_rank(
                [r["leads_educated"] + r["pdf_covered"] for r in peers],
                row["leads_educated"] + row["pdf_covered"],
            )
            sub_pipeline = _percentile_rank(
                [r["pipeline_total"] for r in peers],
                row["pipeline_total"],
            )
            sub_results = _percentile_rank(
                [r["payments"] for r in peers],
                row["payments"],
            )

            # Integrity penalty: trust_score < 50 → cap composite at 40
            trust = row["trust_score"]
            composite = (
                sub_consistency * W["consistency"]
                + sub_calls * W["call_volume"]
                + sub_pickup * W["pickup_rate"]
                + sub_education * W["lead_education"]
                + sub_pipeline * W["pipeline"]
                + sub_results * W["results"]
            )
            if trust < 50 and row["submission_days"] > 0:
                composite = min(composite, 40.0)

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
                "improving" if row["trend_pct"] > 10
                else "declining" if row["trend_pct"] < -10
                else "stable" if row["submission_days"] > 0
                else "inactive"
            )

        # 7. Sort & rank
        raw.sort(key=lambda r: r["composite_score"], reverse=True)
        for i, row in enumerate(raw):
            row["rank"] = i + 1

        # 8. Integrity audit summary
        flagged = [r for r in raw if r["trust_score"] < 70 and r["submission_days"] > 0]
        integrity_audit = {
            "total_flagged": len(flagged),
            "average_trust_score": round(
                statistics.mean([r["trust_score"] for r in raw if r["submission_days"] > 0])
                if any(r["submission_days"] > 0 for r in raw) else 100, 1
            ),
            "flagged_members": [
                {
                    "rank": r["rank"],
                    "user_id": r["user_id"],
                    "name": r["name"],
                    "fbo_id": r["fbo_id"],
                    "phone": r["phone"],
                    "reported_calls": r["total_calls"],
                    "actual_calls": r["actual_calls"],
                    "discrepancy": r["discrepancy"],
                    "discrepancy_pct": r["discrepancy_pct"],
                    "trust_score": r["trust_score"],
                    "tier": r["tier"],
                }
                for r in flagged[:20]
            ],
        }

        # 9. Elite-at-risk prediction
        elite_at_risk = await self._compute_elite_risk(raw, days)

        # 10. Suggested group
        suggested_elite = [
            {
                "rank": r["rank"], "user_id": r["user_id"],
                "name": r["name"], "fbo_id": r["fbo_id"],
                "phone": r["phone"],
                "composite_score": r["composite_score"],
                "tier": r["tier"],
                "reason": f"Score {r['composite_score']} — {r['tier_desc']}",
            }
            for r in raw if r["tier"] == "elite"
        ]
        suggested_strong = [
            {
                "rank": r["rank"], "user_id": r["user_id"],
                "name": r["name"], "fbo_id": r["fbo_id"],
                "phone": r["phone"],
                "composite_score": r["composite_score"],
                "tier": r["tier"],
                "reason": f"Score {r['composite_score']} — {r['tier_desc']}",
            }
            for r in raw if r["tier"] == "strong"
        ]

        # 11. Build output
        performers_out = []
        for r in raw:
            performers_out.append({
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
                "trust_score": r["trust_score"],
                "metrics": {
                    "submission_days": r["submission_days"],
                    "total_calls": r["total_calls"],
                    "actual_calls": r["actual_calls"],
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
            })

        active_count = sum(1 for r in raw if r["submission_days"] > 0)
        all_scores = [r["composite_score"] for r in raw]
        avg_score = statistics.mean(all_scores) if all_scores else 0
        median_score = statistics.median(all_scores) if all_scores else 0

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
            "integrity_audit": integrity_audit,
            "elite_at_risk": elite_at_risk,
            "suggested_group": {
                "elite": suggested_elite,
                "strong": suggested_strong,
                "total_count": len(suggested_elite) + len(suggested_strong),
                "all_phones": list(
                    dict.fromkeys(
                        r["phone"] for r in suggested_elite + suggested_strong if r["phone"]
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

    # ──────────────────────────────────────────────────────────────────────
    # Integrity audit — reported vs actual calls
    # ──────────────────────────────────────────────────────────────────────

    async def _compute_integrity_audit(
        self,
        user_ids: list[int],
        start_date: date,
        end_date: date,
        raw: list[dict],
    ) -> dict[str, Any]:
        """Cross-check DailyReport vs CallEvent per user."""
        # Already computed inline in get_performer_insights — this is a
        # dedicated extraction for standalone use if needed.
        flagged = [r for r in raw if r.get("trust_score", 100) < 70]
        return {
            "total_flagged": len(flagged),
            "average_trust_score": round(
                statistics.mean([r["trust_score"] for r in raw if r.get("trust_score", 100) > 0])
                if raw else 100, 1
            ),
            "flagged_members": [
                {"rank": r.get("rank", 0), "user_id": r["user_id"],
                 "name": r["name"], "fbo_id": r["fbo_id"],
                 "phone": r.get("phone", ""),
                 "reported_calls": r["total_calls"],
                 "actual_calls": r.get("actual_calls", 0),
                 "discrepancy": r.get("discrepancy", 0),
                 "discrepancy_pct": r.get("discrepancy_pct", 0),
                 "trust_score": r.get("trust_score", 100),
                 "tier": r.get("tier", "inactive")}
                for r in flagged[:20]
            ],
        }

    # ──────────────────────────────────────────────────────────────────────
    # Elite-at-risk prediction
    # ──────────────────────────────────────────────────────────────────────

    async def _compute_elite_risk(
        self,
        raw: list[dict],
        days: int,
    ) -> dict[str, Any]:
        """Identify elite/strong members who are going inactive.

        Methodology
        ───────────
        1.  Consider only members whose **current tier** is elite or strong.
        2.  Measure **days since last activity** (last report submission date
            or last call event).
        3.  Cross-reference with **grace history** (has this member abused
            grace before?).
        4.  Classify risk:
            - **high**:   inactive 7+ days, OR inactive 5+ days with bad grace history
            - **medium**: inactive 5+ days, OR inactive 3+ days with bad grace
            - **low**:    inactive 3+ days, but no grace red flags
            - **none**:   still active
        5.  For each at-risk member, generate a suggested admin action.
        """
        # Filter to elite + strong
        candidates = [r for r in raw if r.get("tier") in ("elite", "strong")]
        if not candidates:
            return {"total_at_risk": 0, "members": []}

        # Load grace history for these users
        candidate_ids = [r["user_id"] for r in candidates]
        grace_ctx = await get_grace_contexts_batch(self.session, candidate_ids)

        # Load latest report date per user
        now = datetime.now(timezone.utc)
        today = date.today()

        at_risk_members = []
        for row in candidates:
            uid = row["user_id"]
            last_report_date = None
            last_activity_date = None

            # Calculate last activity based on reports
            # (reports are already loaded, but we don't have per-date info here
            #  beyond submission_days. We'll check presence + reports.)
            # Load the most recent DailyReport for this user
            last_report_q = await self.session.execute(
                select(DailyReport.report_date)
                .where(DailyReport.user_id == uid)
                .order_by(DailyReport.report_date.desc())
                .limit(1)
            )
            last_report_row = last_report_q.first()
            if last_report_row:
                last_report_date = last_report_row.report_date
                last_activity_date = last_report_date

            # Also check last CallEvent
            last_call_q = await self.session.execute(
                select(func.date(CallEvent.called_at))
                .where(CallEvent.user_id == uid)
                .order_by(CallEvent.called_at.desc())
                .limit(1)
            )
            last_call_row = last_call_q.first()
            if last_call_row:
                call_date = last_call_row[0]
                if isinstance(call_date, datetime):
                    call_date = call_date.date()
                if last_activity_date is None or call_date > last_activity_date:
                    last_activity_date = call_date
                    last_report_date = call_date  # treat as "last seen"

            if last_activity_date is None:
                # No activity ever — skip (shouldn't reach here for elite)
                continue

            days_since_activity = (today - last_activity_date).days
            grace = grace_ctx.get(uid, {"risk": "low", "count_30d": 0, "last_outcome": None})
            grace_risk = grace.get("risk", "low")
            grace_count = grace.get("count_30d", 0)

            # Risk classification
            if days_since_activity >= INACTIVITY_RISK_DAYS["high"]:
                risk = "high"
            elif days_since_activity >= INACTIVITY_RISK_DAYS["medium"]:
                if grace_risk in ("medium", "high") or grace_count >= 1:
                    risk = "high"
                else:
                    risk = "medium"
            elif days_since_activity >= INACTIVITY_RISK_DAYS["low"]:
                if grace_risk == "high" or grace_count >= 2:
                    risk = "medium"
                else:
                    risk = "low"
            else:
                risk = "none"

            if risk == "none":
                continue

            # Suggested action
            if risk == "high":
                suggestion = (
                    f"⚠️ **{row['name']}** inactive for {days_since_activity}d. "
                    f"{'Bad grace history.' if grace_risk != 'low' else ''} "
                    f"Call or WhatsApp immediately to re-engage."
                )
            elif risk == "medium":
                suggestion = (
                    f"👀 **{row['name']}** inactive for {days_since_activity}d. "
                    f"Send a check-in message."
                )
            else:
                suggestion = (
                    f"🌱 **{row['name']}** slowing down ({days_since_activity}d). "
                    f"Encourage them to get back."
                )

            at_risk_members.append({
                "user_id": uid,
                "name": row["name"],
                "fbo_id": row["fbo_id"],
                "phone": row.get("phone", ""),
                "tier": row.get("tier", "strong"),
                "composite_score": row.get("composite_score", 0),
                "days_since_activity": days_since_activity,
                "risk_level": risk,
                "last_active_date": last_activity_date.isoformat() if last_activity_date else None,
                "grace_risk": grace_risk,
                "grace_count_30d": grace_count,
                "suggested_action": suggestion,
                "whatsapp_link": (
                    f"https://wa.me/{row['phone'].replace('+', '')}"
                    f"?text=Hey%20{row['name'].replace(' ', '%20')}%2C%20"
                    f"we%27ve%20been%20missing%20you%20in%20the%20team%21%20"
                    f"Everything%20okay%3F"
                ) if row.get("phone") else "",
            })

        at_risk_members.sort(key=lambda m: (
            {"high": 0, "medium": 1, "low": 2}[m["risk_level"]],
            m["days_since_activity"],
        ), reverse=False)

        return {
            "total_at_risk": len(at_risk_members),
            "members": at_risk_members,
        }

    # ──────────────────────────────────────────────────────────────────────
    # Empty response helper
    # ──────────────────────────────────────────────────────────────────────

    def _empty_response(self, days: int, users: list) -> dict[str, Any]:
        return {
            "period_days": days,
            "total_members": len(users),
            "performers": [],
            "integrity_audit": {"total_flagged": 0, "average_trust_score": 100.0, "flagged_members": []},
            "elite_at_risk": {"total_at_risk": 0, "members": []},
            "suggested_group": {"elite": [], "strong": [], "total_count": 0, "all_phones": [], "whatsapp_group_intro": ""},
        }
