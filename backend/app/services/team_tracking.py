from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_member_stat import DailyMemberStat
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession

PRESENCE_ONLINE_STALE_SECONDS = 45
TREND_DAYS = 7

_LOGIN_TARGET = 1
_CALLS_TARGET = 30
_LEADS_TARGET = 10
_FOLLOWUPS_TARGET = 15


def ist_day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def today_ist() -> date:
    return datetime.now(IST).date()


def _activity_day_for(ts: datetime | None) -> date:
    base = ts or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base.astimezone(IST).date()


def _aware_utc(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def _norm(actual: int, target: int) -> float:
    if target <= 0:
        return 0.0
    return min(max(actual, 0) / target, 1.0)


def compute_consistency_score(
    *,
    login_count: int,
    calls_count: int,
    leads_added_count: int,
    followups_done_count: int,
) -> tuple[int, str]:
    score = round(
        100
        * (
            (0.15 * _norm(login_count, _LOGIN_TARGET))
            + (0.30 * _norm(calls_count, _CALLS_TARGET))
            + (0.25 * _norm(leads_added_count, _LEADS_TARGET))
            + (0.30 * _norm(followups_done_count, _FOLLOWUPS_TARGET))
        )
    )
    if score >= 75:
        return int(score), "high"
    if score >= 40:
        return int(score), "medium"
    return int(score), "low"


def _latest(*values: datetime | None) -> datetime | None:
    present = [_aware_utc(v) for v in values if v is not None]
    if not present:
        return None
    return max(present)


async def record_login_activity(
    session: AsyncSession,
    *,
    user_id: int,
    occurred_at: datetime | None = None,
) -> None:
    now = occurred_at or datetime.now(timezone.utc)
    session.add(
        ActivityLog(
            user_id=user_id,
            action="login",
            entity_type="auth",
            meta={"source": "password_login"},
            created_at=now,
        )
    )
    await session.flush()
    await recompute_daily_member_stat(session, user_id=user_id, stat_date=_activity_day_for(now))


async def record_followup_completion_activity(
    session: AsyncSession,
    *,
    user_id: int,
    follow_up_id: int,
    lead_id: int,
    occurred_at: datetime,
) -> None:
    session.add(
        ActivityLog(
            user_id=user_id,
            action="follow_up.completed",
            entity_type="follow_up",
            entity_id=follow_up_id,
            meta={"lead_id": lead_id},
            created_at=occurred_at,
        )
    )
    await session.flush()
    await recompute_daily_member_stat(session, user_id=user_id, stat_date=_activity_day_for(occurred_at))


async def recompute_daily_member_stat(
    session: AsyncSession,
    *,
    user_id: int,
    stat_date: date,
) -> DailyMemberStat:
    start, end = ist_day_bounds(stat_date)

    login_count = int(
        (
            await session.execute(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.user_id == user_id,
                    ActivityLog.action == "login",
                    ActivityLog.created_at >= start,
                    ActivityLog.created_at < end,
                )
            )
        ).scalar_one()
        or 0
    )
    calls_count = int(
        (
            await session.execute(
                select(func.count())
                .select_from(CallEvent)
                .where(
                    CallEvent.user_id == user_id,
                    CallEvent.called_at >= start,
                    CallEvent.called_at < end,
                )
            )
        ).scalar_one()
        or 0
    )
    leads_added_count = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Lead)
                .where(
                    Lead.created_by_user_id == user_id,
                    Lead.created_at >= start,
                    Lead.created_at < end,
                    Lead.in_pool.is_(False),
                )
            )
        ).scalar_one()
        or 0
    )
    followups_done_count = int(
        (
            await session.execute(
                select(func.count())
                .select_from(FollowUp)
                .where(
                    FollowUp.completed_by_user_id == user_id,
                    FollowUp.completed_at.is_not(None),
                    FollowUp.completed_at >= start,
                    FollowUp.completed_at < end,
                )
            )
        ).scalar_one()
        or 0
    )

    latest_login = (
        await session.execute(
            select(func.max(ActivityLog.created_at)).where(
                ActivityLog.user_id == user_id,
                ActivityLog.action == "login",
                ActivityLog.created_at >= start,
                ActivityLog.created_at < end,
            )
        )
    ).scalar_one_or_none()
    latest_call = (
        await session.execute(
            select(func.max(CallEvent.called_at)).where(
                CallEvent.user_id == user_id,
                CallEvent.called_at >= start,
                CallEvent.called_at < end,
            )
        )
    ).scalar_one_or_none()
    latest_lead = (
        await session.execute(
            select(func.max(Lead.created_at)).where(
                Lead.created_by_user_id == user_id,
                Lead.created_at >= start,
                Lead.created_at < end,
                Lead.in_pool.is_(False),
            )
        )
    ).scalar_one_or_none()
    latest_followup = (
        await session.execute(
            select(func.max(FollowUp.completed_at)).where(
                FollowUp.completed_by_user_id == user_id,
                FollowUp.completed_at.is_not(None),
                FollowUp.completed_at >= start,
                FollowUp.completed_at < end,
            )
        )
    ).scalar_one_or_none()

    score, band = compute_consistency_score(
        login_count=login_count,
        calls_count=calls_count,
        leads_added_count=leads_added_count,
        followups_done_count=followups_done_count,
    )
    last_activity_at = _latest(latest_login, latest_call, latest_lead, latest_followup)

    row = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id == user_id,
                DailyMemberStat.stat_date == stat_date,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = DailyMemberStat(user_id=user_id, stat_date=stat_date)
        session.add(row)

    row.login_count = login_count
    row.calls_count = calls_count
    row.leads_added_count = leads_added_count
    row.followups_done_count = followups_done_count
    row.consistency_score = score
    row.consistency_band = band
    row.last_activity_at = last_activity_at
    row.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return row


async def refresh_daily_member_stat_after_change(
    session: AsyncSession,
    *,
    user_id: int,
    occurred_at: datetime | None = None,
) -> None:
    await recompute_daily_member_stat(
        session,
        user_id=user_id,
        stat_date=_activity_day_for(occurred_at),
    )
    await session.commit()


def _presence_effective_status(
    row: UserPresenceSession,
    *,
    now: datetime,
) -> str:
    if row.disconnected_at is not None:
        return "offline"
    heartbeat_at = _aware_utc(row.last_heartbeat_at)
    if heartbeat_at is None:
        return "offline"
    if heartbeat_at < now - timedelta(seconds=PRESENCE_ONLINE_STALE_SECONDS):
        return "offline"
    status = (row.status or "").strip().lower()
    if status == "idle":
        return "idle"
    return "online"


async def sweep_stale_presence(session: AsyncSession, *, now: datetime | None = None) -> set[int]:
    ts = now or datetime.now(timezone.utc)
    stale_before = ts - timedelta(seconds=PRESENCE_ONLINE_STALE_SECONDS)
    rows = (
        await session.execute(
            select(UserPresenceSession).where(
                UserPresenceSession.disconnected_at.is_(None),
                UserPresenceSession.last_heartbeat_at < stale_before,
            )
        )
    ).scalars().all()
    touched: set[int] = set()
    users_cache: dict[int, User] = {}
    for row in rows:
        row.status = "offline"
        row.disconnected_at = ts
        row.updated_at = ts
        touched.add(int(row.user_id))
        user = users_cache.get(int(row.user_id))
        if user is None:
            user = await session.get(User, int(row.user_id))
            if user is not None:
                users_cache[int(row.user_id)] = user
        if user is not None:
            candidate = _aware_utc(row.last_seen_at) or _aware_utc(row.last_heartbeat_at)
            current_seen = _aware_utc(user.last_seen_at)
            if candidate is not None and (
                current_seen is None or current_seen < candidate
            ):
                user.last_seen_at = candidate
    if touched:
        await session.commit()
    return touched


async def connect_presence_session(
    session: AsyncSession,
    *,
    user_id: int,
    session_key: str,
    last_path: str | None,
    user_agent: str | None,
    now: datetime | None = None,
) -> bool:
    ts = now or datetime.now(timezone.utc)
    row = (
        await session.execute(
            select(UserPresenceSession).where(UserPresenceSession.session_key == session_key)
        )
    ).scalar_one_or_none()
    prev = "offline" if row is None else _presence_effective_status(row, now=ts)
    if row is None:
        row = UserPresenceSession(
            user_id=user_id,
            session_key=session_key,
            connected_at=ts,
            status="online",
            last_heartbeat_at=ts,
            last_seen_at=ts,
            last_path=last_path,
            user_agent=user_agent,
            updated_at=ts,
        )
        session.add(row)
    else:
        row.user_id = user_id
        row.status = "online"
        row.connected_at = ts
        row.disconnected_at = None
        row.last_heartbeat_at = ts
        row.last_seen_at = ts
        row.last_path = last_path or row.last_path
        row.user_agent = user_agent or row.user_agent
        row.updated_at = ts
    user = await session.get(User, user_id)
    if user is not None:
        user.last_seen_at = ts
    await session.commit()
    return prev != "online"


async def touch_presence_session(
    session: AsyncSession,
    *,
    user_id: int,
    session_key: str,
    status: str,
    last_path: str | None,
    now: datetime | None = None,
) -> bool:
    ts = now or datetime.now(timezone.utc)
    row = (
        await session.execute(
            select(UserPresenceSession).where(UserPresenceSession.session_key == session_key)
        )
    ).scalar_one_or_none()
    if row is None:
        return await connect_presence_session(
            session,
            user_id=user_id,
            session_key=session_key,
            last_path=last_path,
            user_agent=None,
            now=ts,
        )
    prev = _presence_effective_status(row, now=ts)
    row.status = "idle" if status == "idle" else "online"
    row.disconnected_at = None
    row.last_heartbeat_at = ts
    row.last_seen_at = ts
    row.updated_at = ts
    if last_path:
        row.last_path = last_path
    user = await session.get(User, user_id)
    if user is not None:
        user.last_seen_at = ts
    await session.commit()
    return prev != row.status


async def disconnect_presence_session(
    session: AsyncSession,
    *,
    user_id: int,
    session_key: str,
    now: datetime | None = None,
) -> bool:
    ts = now or datetime.now(timezone.utc)
    row = (
        await session.execute(
            select(UserPresenceSession).where(UserPresenceSession.session_key == session_key)
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    prev = _presence_effective_status(row, now=ts)
    row.status = "offline"
    row.disconnected_at = ts
    row.last_seen_at = ts
    row.updated_at = ts
    user = await session.get(User, user_id)
    if user is not None:
        user.last_seen_at = ts
    await session.commit()
    return prev != "offline"
