"""Intelligent performer insights — identifies who is genuinely working."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User


W_CONSISTENCY = 0.20
W_CALLS = 0.20
W_LEAD_EDUCATION = 0.20
W_PIPELINE = 0.25
W_RESULTS = 0.15

TARGET_DAILY_CALLS = 50
TARGET_DAILY_LEADS_EDUCATED = 10


class PerformerInsightsService:
    """Intelligent analysis ranking who is genuinely working."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_performer_insights(
        self,
        days: int = 30,
        min_reports: int = 1,
    ) -> dict[str, Any]:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        users_q = await self.session.execute(
            select(User).where(
                User.role.in_(["leader", "team"]),
                User.registration_status == "approved",
                User.removed_at.is_(None),
            )
        )
        users = users_q.scalars().all()
        user_ids = [u.id for u in users]
        user_map = {u.id: u for u in users}

        if not user_ids:
            return {"period_days": days, "total_members": 0, "performers": []}

        reports_q = await self.session.execute(
            select(DailyReport).where(
                DailyReport.user_id.in_(user_ids),
                DailyReport.report_date >= start_date,
                DailyReport.report_date <= end_date,
            ).order_by(DailyReport.user_id, DailyReport.report_date)
        )
        reports = reports_q.scalars().all()

        reports_by_user: dict[int, list[DailyReport]] = {}
        for r in reports:
            reports_by_user.setdefault(int(r.user_id), []).append(r)

        leads_q = await self.session.execute(
            select(
                Lead.assigned_to_user_id,
                func.count(Lead.id).label("total_leads"),
                func.sum(case((Lead.status == "converted", 1), else_=0)).label("converted_leads"),
                func.sum(case((Lead.payment_status == "approved", 1), else_=0)).label("paid_leads"),
            ).where(
                Lead.assigned_to_user_id.in_(user_ids),
                Lead.deleted_at.is_(None),
                Lead.created_at >= datetime.combine(start_date, datetime.min.time()),
                Lead.created_at <= datetime.combine(end_date, datetime.max.time()),
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

        performers: list[dict] = []
        for uid in user_ids:
            user = user_map.get(uid)
            if not user:
                continue

            user_reports = reports_by_user.get(uid, [])
            report_count = len(user_reports)
            if report_count < min_reports and days > 7:
                continue

            submission_days = len({r.report_date for r in user_reports})
            consistency_ratio = submission_days / days if days > 0 else 0
            consistency_score = min(consistency_ratio * 100, 100)

            if user_reports:
                total_calls = sum(r.total_calling or 0 for r in user_reports)
                calls_picked = sum(r.calls_picked or 0 for r in user_reports)
                avg_daily_calls = total_calls / days if days > 0 else 0
                calls_normalized = min(avg_daily_calls / TARGET_DAILY_CALLS, 1) * 100
                pickup_rate = (calls_picked / total_calls * 100) if total_calls > 0 else 0

                leads_educated = sum(r.leads_educated or 0 for r in user_reports)
                pdf_covered = sum(r.pdf_covered or 0 for r in user_reports)
                total_educated = leads_educated + pdf_covered
                avg_daily_educated = total_educated / days if days > 0 else 0
                education_normalized = min(avg_daily_educated / TARGET_DAILY_LEADS_EDUCATED, 1) * 100

                day1 = sum(r.day1_count or 0 for r in user_reports)
                day2 = sum(r.day2_count or 0 for r in user_reports)
                day3 = sum(r.day3_count or 0 for r in user_reports)
                total_pipeline = day1 + day2 + day3
                pipeline_normalized = min(total_pipeline / max(report_count, 1) * 2, 100)

                total_payments = sum(r.payments_actual or 0 for r in user_reports)
                payments_normalized = min(total_payments * 10, 100)

                mid_point = len(user_reports) // 2
                if mid_point > 0 and len(user_reports) >= 4:
                    early_half = user_reports[:mid_point]
                    late_half = user_reports[mid_point:]
                    early_avg = sum(r.total_calling or 0 for r in early_half) / len(early_half)
                    late_avg = sum(r.total_calling or 0 for r in late_half) / len(late_half)
                    trend_pct = ((late_avg - early_avg) / early_avg * 100) if early_avg > 0 else 0
                    trend_label = "improving" if trend_pct > 10 else "declining" if trend_pct < -10 else "stable"
                else:
                    trend_pct = 0
                    trend_label = "stable"
            else:
                total_calls = 0
                calls_picked = 0
                avg_daily_calls = 0
                pickup_rate = 0
                calls_normalized = 0
                total_educated = 0
                education_normalized = 0
                day1 = day2 = day3 = 0
                total_pipeline = 0
                pipeline_normalized = 0
                total_payments = 0
                payments_normalized = 0
                trend_pct = 0
                trend_label = "inactive"

            ls = lead_stats.get(uid, {})
            total_leads_taken = ls.get("total_leads", 0)
            converted_leads = ls.get("converted_leads", 0)
            paid_leads = ls.get("paid_leads", 0)

            composite = (
                consistency_score * W_CONSISTENCY
                + calls_normalized * W_CALLS
                + education_normalized * W_LEAD_EDUCATION
                + pipeline_normalized * W_PIPELINE
                + payments_normalized * W_RESULTS
            )

            performers.append({
                "rank": 0,
                "user_id": uid,
                "name": user.name or user.username or user.fbo_id,
                "fbo_id": user.fbo_id,
                "role": user.role,
                "composite_score": round(composite, 1),
                "breakdown": {
                    "consistency": round(consistency_score, 1),
                    "call_activity": round(calls_normalized, 1),
                    "lead_education": round(education_normalized, 1),
                    "pipeline_conversion": round(pipeline_normalized, 1),
                    "results": round(payments_normalized, 1),
                },
                "metrics": {
                    "submission_days": submission_days,
                    "total_calls": total_calls,
                    "calls_picked": calls_picked,
                    "pickup_rate": round(pickup_rate, 1),
                    "avg_daily_calls": round(avg_daily_calls, 1),
                    "leads_educated": total_educated,
                    "pipeline_total": total_pipeline,
                    "payments": total_payments,
                    "leads_taken": total_leads_taken,
                    "converted_leads": converted_leads,
                    "paid_leads": paid_leads,
                },
                "trend": trend_label,
                "trend_pct": round(trend_pct, 1),
            })

        performers.sort(key=lambda x: x["composite_score"], reverse=True)
        for i, p in enumerate(performers):
            p["rank"] = i + 1

        active_count = sum(1 for p in performers if p["metrics"]["submission_days"] > 0)
        avg_score = sum(p["composite_score"] for p in performers) / len(performers) if performers else 0
        top_performers = [p for p in performers if p["composite_score"] >= 50]

        return {
            "period_days": days,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "total_members": len(users),
            "active_members": active_count,
            "top_performer_count": len(top_performers),
            "average_score": round(avg_score, 1),
            "performers": performers,
        }
