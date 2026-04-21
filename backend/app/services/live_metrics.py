"""Shared live metrics for dashboard gates, execution strips, and admin summaries."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.app_setting import AppSetting
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.services.downline import (
    lead_execution_visible_to_leader_clause,
    lead_visible_to_leader_clause,
    recursive_downline_user_ids,
)
from app.core.time_ist import IST

DEFAULT_DAILY_CALL_TARGET = 15
_CALL_TARGET_SETTING_KEYS = ("daily_call_target", "call_target_daily")


def ist_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Start (inclusive) and end (exclusive) of an IST calendar day."""
    start = datetime.combine(day, time.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def _normalized_user_ids(user_ids: Iterable[int]) -> list[int]:
    return sorted({int(uid) for uid in user_ids if uid is not None})


def _fresh_call_gate_clause(
    start: datetime,
    end: datetime,
):
    claimed_today = exists(
        select(1).where(
            ActivityLog.action == "lead.claimed",
            ActivityLog.entity_type == "lead",
            ActivityLog.entity_id == CallEvent.lead_id,
            ActivityLog.user_id == CallEvent.user_id,
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
            ActivityLog.created_at <= CallEvent.called_at,
        )
    )
    created_today = and_(
        Lead.created_by_user_id == CallEvent.user_id,
        Lead.created_at >= start,
        Lead.created_at < end,
        Lead.created_at <= CallEvent.called_at,
    )
    return and_(
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
        or_(claimed_today, created_today),
    )


async def get_daily_call_target(session: AsyncSession) -> int:
    stmt = select(AppSetting.key, AppSetting.value).where(
        AppSetting.key.in_(_CALL_TARGET_SETTING_KEYS),
    )
    rows = {str(key): str(value or "").strip() for key, value in (await session.execute(stmt)).all()}
    for key in _CALL_TARGET_SETTING_KEYS:
        raw = rows.get(key)
        if not raw:
            continue
        try:
            parsed = int(raw)
        except ValueError:
            continue
        if parsed > 0:
            return parsed
    return DEFAULT_DAILY_CALL_TARGET


async def fresh_call_counts_by_user(
    session: AsyncSession,
    user_ids: Iterable[int],
    day: date,
) -> dict[int, int]:
    ids = _normalized_user_ids(user_ids)
    if not ids:
        return {}
    start, end = ist_day_bounds(day)
    stmt = (
        select(
            CallEvent.user_id.label("uid"),
            func.count(func.distinct(CallEvent.lead_id)).label("cnt"),
        )
        .select_from(CallEvent)
        .join(Lead, Lead.id == CallEvent.lead_id)
        .where(
            CallEvent.user_id.in_(ids),
            CallEvent.called_at >= start,
            CallEvent.called_at < end,
            _fresh_call_gate_clause(start, end),
        )
        .group_by(CallEvent.user_id)
    )
    rows = await session.execute(stmt)
    return {int(uid): int(cnt or 0) for uid, cnt in rows.all()}


async def fresh_call_count_total(
    session: AsyncSession,
    day: date,
    *,
    user_ids: Iterable[int] | None = None,
) -> int:
    start, end = ist_day_bounds(day)
    stmt = (
        select(func.count(func.distinct(CallEvent.lead_id)))
        .select_from(CallEvent)
        .join(Lead, Lead.id == CallEvent.lead_id)
        .where(
            CallEvent.called_at >= start,
            CallEvent.called_at < end,
            _fresh_call_gate_clause(start, end),
        )
    )
    if user_ids is not None:
        ids = _normalized_user_ids(user_ids)
        if not ids:
            return 0
        stmt = stmt.where(CallEvent.user_id.in_(ids))
    return int((await session.execute(stmt)).scalar_one() or 0)


async def fresh_lead_counts_by_user(
    session: AsyncSession,
    user_ids: Iterable[int],
    day: date,
) -> dict[int, int]:
    ids = _normalized_user_ids(user_ids)
    if not ids:
        return {}
    start, end = ist_day_bounds(day)
    created_stmt = (
        select(
            Lead.created_by_user_id.label("uid"),
            Lead.id.label("lead_id"),
        )
        .where(
            Lead.created_by_user_id.in_(ids),
            Lead.created_at >= start,
            Lead.created_at < end,
            Lead.deleted_at.is_(None),
            Lead.in_pool.is_(False),
        )
    )
    claimed_stmt = (
        select(
            ActivityLog.user_id.label("uid"),
            ActivityLog.entity_id.label("lead_id"),
        )
        .where(
            ActivityLog.user_id.in_(ids),
            ActivityLog.action == "lead.claimed",
            ActivityLog.entity_type == "lead",
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
        )
    )
    fresh_union = created_stmt.union_all(claimed_stmt).subquery()
    stmt = (
        select(
            fresh_union.c.uid,
            func.count(func.distinct(fresh_union.c.lead_id)).label("cnt"),
        )
        .group_by(fresh_union.c.uid)
    )
    rows = await session.execute(stmt)
    return {int(uid): int(cnt or 0) for uid, cnt in rows.all()}


async def pending_payment_proof_count(
    session: AsyncSession,
    *,
    role: str,
    user_id: int | None = None,
) -> int:
    base = [
        Lead.deleted_at.is_(None),
        Lead.payment_proof_url.isnot(None),
        Lead.payment_proof_url != "",
        Lead.payment_status == "proof_uploaded",
    ]
    role_key = (role or "").strip().lower()
    if role_key == "leader":
        if user_id is None:
            return 0
        base.append(
            or_(
                lead_visible_to_leader_clause(user_id),
                lead_execution_visible_to_leader_clause(user_id),
            )
        )
    elif role_key == "team":
        if user_id is None:
            return 0
        base.append(
            or_(
                Lead.created_by_user_id == user_id,
                Lead.assigned_to_user_id == user_id,
            )
        )
    stmt = select(func.count()).select_from(Lead).where(*base)
    return int((await session.execute(stmt)).scalar_one() or 0)


async def analytics_scope_user_ids(
    session: AsyncSession,
    *,
    user_id: int,
    role: str,
) -> list[int]:
    role_key = (role or "").strip().lower()
    if role_key == "admin":
        stmt = select(User.id).where(User.role.in_(("leader", "team")))
        rows = await session.execute(stmt)
        return [int(uid) for uid in rows.scalars().all()]
    if role_key == "leader":
        downline = await recursive_downline_user_ids(session, user_id)
        return [user_id, *downline]
    return [user_id]


async def downline_team_user_ids(
    session: AsyncSession,
    leader_user_id: int,
) -> list[int]:
    downline = await recursive_downline_user_ids(session, leader_user_id)
    if not downline:
        return []
    stmt = select(User.id).where(
        User.id.in_(downline),
        User.role == "team",
    )
    rows = await session.execute(stmt)
    return [int(uid) for uid in rows.scalars().all()]
