"""Aggregates for scoped Team Reports live tiles."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.services.live_metrics import fresh_call_count_total

IST = ZoneInfo("Asia/Kolkata")


def _normalized_user_ids(user_ids: Iterable[int] | None) -> list[int] | None:
    if user_ids is None:
        return None
    return sorted({int(uid) for uid in user_ids if uid is not None})


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


async def compute_live_summary(
    session: AsyncSession,
    report_date: date,
    *,
    user_ids: Iterable[int] | None = None,
) -> dict[str, int]:
    start, end = ist_day_bounds(report_date)
    scoped_user_ids = _normalized_user_ids(user_ids)
    if scoped_user_ids is not None and not scoped_user_ids:
        return {
            "leads_claimed_today": 0,
            "calls_made_today": 0,
            "enrolled_today": 0,
            "payment_proofs_approved_today": 0,
            "day1_total": 0,
            "day2_total": 0,
            "converted_total": 0,
        }

    claims_stmt = (
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.action == "lead.claimed",
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
        )
    )
    if scoped_user_ids is not None:
        claims_stmt = claims_stmt.where(ActivityLog.user_id.in_(scoped_user_ids))
    claims_q = await session.execute(claims_stmt)
    leads_claimed_today = int(claims_q.scalar_one())

    calls_made_today = await fresh_call_count_total(session, report_date, user_ids=scoped_user_ids)

    enrolled_stmt = (
        select(func.count())
        .select_from(Lead)
        .where(
            Lead.payment_proof_uploaded_at.is_not(None),
            Lead.payment_proof_uploaded_at >= start,
            Lead.payment_proof_uploaded_at < end,
            Lead.deleted_at.is_(None),
        )
    )
    if scoped_user_ids is not None:
        enrolled_stmt = enrolled_stmt.where(Lead.assigned_to_user_id.in_(scoped_user_ids))
    enrolled_q = await session.execute(enrolled_stmt)
    enrolled_today = int(enrolled_q.scalar_one())

    proofs_stmt = (
        select(func.count())
        .select_from(ActivityLog)
        .join(Lead, Lead.id == ActivityLog.entity_id)
        .where(
            ActivityLog.action == "payment_proof_approved",
            ActivityLog.entity_type == "lead",
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
            Lead.deleted_at.is_(None),
        )
    )
    if scoped_user_ids is not None:
        proofs_stmt = proofs_stmt.where(Lead.assigned_to_user_id.in_(scoped_user_ids))
    proofs_approved_q = await session.execute(proofs_stmt)
    payment_proofs_approved_today = int(proofs_approved_q.scalar_one())

    base = _active_pipeline_filter()
    if scoped_user_ids is not None:
        base = and_(base, Lead.assigned_to_user_id.in_(scoped_user_ids))

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
