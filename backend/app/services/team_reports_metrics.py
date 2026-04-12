"""Aggregates for admin Team Reports (legacy ``/leader/team-reports`` live row)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead

IST = ZoneInfo("Asia/Kolkata")


def ist_day_bounds(d: date) -> tuple[datetime, datetime]:
    """Start (inclusive) and end (exclusive) of calendar day in Asia/Kolkata."""
    start = datetime.combine(d, time.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def _active_pipeline_filter():
    """Same idea as main lead list: working set, not pool / archive / deleted."""
    return and_(
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
        Lead.in_pool.is_(False),
    )


async def compute_live_summary(session: AsyncSession, report_date: date) -> dict[str, int]:
    start, end = ist_day_bounds(report_date)

    claims_q = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.action == "lead.claimed",
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
        ),
    )
    leads_claimed_today = int(claims_q.scalar_one())

    calls_q = await session.execute(
        select(func.count())
        .select_from(CallEvent)
        .where(
            CallEvent.called_at >= start,
            CallEvent.called_at < end,
        ),
    )
    calls_made_today = int(calls_q.scalar_one())

    enrolled_q = await session.execute(
        select(func.count())
        .select_from(Lead)
        .where(
            Lead.payment_proof_uploaded_at.is_not(None),
            Lead.payment_proof_uploaded_at >= start,
            Lead.payment_proof_uploaded_at < end,
            Lead.deleted_at.is_(None),
        ),
    )
    enrolled_today = int(enrolled_q.scalar_one())

    proofs_approved_q = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.action == "payment_proof_approved",
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
        ),
    )
    payment_proofs_approved_today = int(proofs_approved_q.scalar_one())

    base = _active_pipeline_filter()

    async def _count_status(status: str) -> int:
        r = await session.execute(
            select(func.count()).select_from(Lead).where(base, Lead.status == status),
        )
        return int(r.scalar_one())

    day1_total = await _count_status("day1")
    day2_total = await _count_status("day2")
    converted_total = await _count_status("converted")

    return {
        "leads_claimed_today": leads_claimed_today,
        "calls_made_today": calls_made_today,
        "enrolled_today": enrolled_today,
        "payment_proofs_approved_today": payment_proofs_approved_today,
        "day1_total": day1_total,
        "day2_total": day2_total,
        "converted_total": converted_total,
    }
