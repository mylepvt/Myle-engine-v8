from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import AuthUser
from app.core.auth_cookies import display_name_from_user
from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_member_stat import DailyMemberStat
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.schemas.team_tracking import (
    TeamTrackingActivityItem,
    TeamTrackingDetailResponse,
    TeamTrackingMemberSummary,
    TeamTrackingOverviewResponse,
    TeamTrackingTrendPoint,
)
from app.services.user_hierarchy import (
    UserHierarchyEntry,
    load_user_hierarchy_entries,
    nearest_leader_entry,
    recursive_downline_user_ids,
)

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


async def ensure_daily_member_stats_for_users(
    session: AsyncSession,
    *,
    user_ids: list[int],
    stat_date: date,
) -> None:
    if not user_ids:
        return
    existing_rows = await session.execute(
        select(DailyMemberStat.user_id).where(
            DailyMemberStat.user_id.in_(user_ids),
            DailyMemberStat.stat_date == stat_date,
        )
    )
    existing = {int(uid) for uid in existing_rows.scalars().all()}
    for user_id in user_ids:
        if user_id not in existing:
            await recompute_daily_member_stat(session, user_id=user_id, stat_date=stat_date)
    await session.commit()


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


@dataclass
class _ScopedMember:
    user: User
    upline: User | None


async def _scope_members(session: AsyncSession, actor: AuthUser) -> list[_ScopedMember]:
    Upline = aliased(User, name="tracking_upline")
    if actor.role == "admin":
        rows = (
            await session.execute(
                select(User, Upline)
                .outerjoin(Upline, User.upline_user_id == Upline.id)
                .where(
                    User.registration_status == "approved",
                    User.role.in_(("leader", "team")),
                )
                .order_by(User.created_at.asc(), User.id.asc())
            )
        ).all()
        return [_ScopedMember(user=row[0], upline=row[1]) for row in rows]
    if actor.role == "leader":
        downline_ids = await recursive_downline_user_ids(session, actor.user_id)
        if not downline_ids:
            return []
        rows = (
            await session.execute(
                select(User, Upline)
                .outerjoin(Upline, User.upline_user_id == Upline.id)
                .where(
                    User.registration_status == "approved",
                    User.id.in_(downline_ids),
                )
                .order_by(User.created_at.asc(), User.id.asc())
            )
        ).all()
        return [_ScopedMember(user=row[0], upline=row[1]) for row in rows]
    row = (
        await session.execute(
            select(User, Upline)
            .outerjoin(Upline, User.upline_user_id == Upline.id)
            .where(User.id == actor.user_id)
            .limit(1)
        )
    ).one_or_none()
    if row is None:
        return []
    return [_ScopedMember(user=row[0], upline=row[1])]


async def _require_scoped_member(
    session: AsyncSession,
    actor: AuthUser,
    *,
    target_user_id: int,
) -> _ScopedMember | None:
    if target_user_id == actor.user_id:
        SelfUpline = aliased(User, name="tracking_self_upline")
        row = (
            await session.execute(
                select(User, SelfUpline)
                .outerjoin(SelfUpline, User.upline_user_id == SelfUpline.id)
                .where(User.id == target_user_id)
                .limit(1)
            )
        ).one_or_none()
        if row is not None:
            return _ScopedMember(user=row[0], upline=row[1])
    members = await _scope_members(session, actor)
    for member in members:
        if member.user.id == target_user_id:
            return member
    return None


async def _presence_by_user(
    session: AsyncSession,
    *,
    user_ids: list[int],
) -> dict[int, tuple[str, datetime | None]]:
    if not user_ids:
        return {}
    now = datetime.now(timezone.utc)
    rows = (
        await session.execute(
            select(UserPresenceSession).where(UserPresenceSession.user_id.in_(user_ids))
        )
    ).scalars().all()
    by_user: dict[int, tuple[str, datetime | None]] = {}
    order = {"offline": 0, "idle": 1, "online": 2}
    for row in rows:
        uid = int(row.user_id)
        status = _presence_effective_status(row, now=now)
        current = by_user.get(uid)
        candidate_seen = _aware_utc(row.last_seen_at) or _aware_utc(row.last_heartbeat_at)
        if current is None or order[status] > order[current[0]]:
            by_user[uid] = (status, candidate_seen)
        elif current[1] is None or (candidate_seen is not None and current[1] < candidate_seen):
            by_user[uid] = (current[0], candidate_seen)
    return by_user


def _member_insights(
    today_row: DailyMemberStat | None,
    *,
    recent_rows: list[DailyMemberStat],
) -> list[str]:
    row = today_row
    insights: list[str] = []
    if row is None or (
        row.login_count == 0
        and row.calls_count == 0
        and row.leads_added_count == 0
        and row.followups_done_count == 0
    ):
        insights.append("No tracked activity today")
        return insights
    if row.calls_count >= 20 and row.followups_done_count < max(1, int(row.calls_count * 0.25)):
        insights.append("High calls, low follow-up")
    if row.leads_added_count >= 8 and row.followups_done_count <= 3:
        insights.append("Lead generation strong, follow-up weak")
    consistent_days = sum(1 for item in recent_rows if int(item.consistency_score or 0) >= 75)
    if consistent_days >= 5:
        insights.append("Consistent performer this week")
    if not insights and int(row.consistency_score or 0) >= 75:
        insights.append("High consistency today")
    return insights


async def _build_member_summary(
    *,
    member: _ScopedMember,
    stat_date: date,
    stats_map: dict[int, DailyMemberStat],
    presence_map: dict[int, tuple[str, datetime | None]],
    history_map: dict[int, list[DailyMemberStat]],
    hierarchy_entries: dict[int, UserHierarchyEntry],
) -> TeamTrackingMemberSummary:
    leader = nearest_leader_entry(member.user.id, hierarchy_entries)
    today_row = stats_map.get(int(member.user.id))
    recent_rows = history_map.get(int(member.user.id), [])
    presence_status, presence_seen = presence_map.get(int(member.user.id), ("offline", None))
    member_name = display_name_from_user(member.user) or member.user.fbo_id
    upline_name = (
        (display_name_from_user(member.upline) or member.upline.fbo_id)
        if member.upline is not None
        else None
    )
    last_seen_at = presence_seen or _aware_utc(member.user.last_seen_at)
    return TeamTrackingMemberSummary(
        user_id=member.user.id,
        member_name=member_name,
        member_username=(member.user.username or "").strip() or None,
        member_email=member.user.email,
        member_phone=member.user.phone,
        member_fbo_id=member.user.fbo_id,
        member_role=member.user.role,
        upline_name=upline_name,
        upline_fbo_id=member.upline.fbo_id if member.upline is not None else None,
        leader_user_id=leader.id if leader is not None else None,
        leader_name=leader.display_name if leader is not None else None,
        presence_status=presence_status,
        last_seen_at=last_seen_at,
        last_activity_at=today_row.last_activity_at if today_row is not None else None,
        login_count=int(today_row.login_count or 0) if today_row is not None else 0,
        calls_count=int(today_row.calls_count or 0) if today_row is not None else 0,
        leads_added_count=int(today_row.leads_added_count or 0) if today_row is not None else 0,
        followups_done_count=int(today_row.followups_done_count or 0) if today_row is not None else 0,
        consistency_score=int(today_row.consistency_score or 0) if today_row is not None else 0,
        consistency_band=(today_row.consistency_band or "low") if today_row is not None else "low",
        insights=_member_insights(today_row, recent_rows=recent_rows),
    )


async def _history_rows_by_user(
    session: AsyncSession,
    *,
    user_ids: list[int],
    end_date: date,
) -> dict[int, list[DailyMemberStat]]:
    if not user_ids:
        return {}
    start_date = end_date - timedelta(days=TREND_DAYS - 1)
    rows = (
        await session.execute(
            select(DailyMemberStat)
            .where(
                DailyMemberStat.user_id.in_(user_ids),
                DailyMemberStat.stat_date >= start_date,
                DailyMemberStat.stat_date <= end_date,
            )
            .order_by(DailyMemberStat.user_id.asc(), DailyMemberStat.stat_date.asc())
        )
    ).scalars().all()
    out: dict[int, list[DailyMemberStat]] = {}
    for row in rows:
        out.setdefault(int(row.user_id), []).append(row)
    return out


async def get_tracking_overview(
    session: AsyncSession,
    *,
    actor: AuthUser,
    stat_date: date,
) -> TeamTrackingOverviewResponse:
    await sweep_stale_presence(session)
    members = await _scope_members(session, actor)
    user_ids = [int(item.user.id) for item in members]
    await ensure_daily_member_stats_for_users(session, user_ids=user_ids, stat_date=stat_date)

    stats_rows = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id.in_(user_ids) if user_ids else DailyMemberStat.user_id == -1,
                DailyMemberStat.stat_date == stat_date,
            )
        )
    ).scalars().all()
    stats_map = {int(row.user_id): row for row in stats_rows}
    history_map = await _history_rows_by_user(session, user_ids=user_ids, end_date=stat_date)
    presence_map = await _presence_by_user(session, user_ids=user_ids)
    hierarchy_entries = await load_user_hierarchy_entries(session, user_ids)

    items = [
        await _build_member_summary(
            member=member,
            stat_date=stat_date,
            stats_map=stats_map,
            presence_map=presence_map,
            history_map=history_map,
            hierarchy_entries=hierarchy_entries,
        )
        for member in members
    ]
    items.sort(
        key=lambda item: (
            0 if item.presence_status == "online" else 1 if item.presence_status == "idle" else 2,
            -(item.consistency_score or 0),
            item.member_name.lower(),
        )
    )
    total = len(items)
    average_score = round(sum(item.consistency_score for item in items) / total, 1) if total else 0.0
    return TeamTrackingOverviewResponse(
        items=items,
        total=total,
        scope_total_members=total,
        online_count=sum(1 for item in items if item.presence_status == "online"),
        idle_count=sum(1 for item in items if item.presence_status == "idle"),
        offline_count=sum(1 for item in items if item.presence_status == "offline"),
        average_score=average_score,
        date=stat_date.isoformat(),
        note="Preview uses canonical org-tree scope and server-side activity sources only.",
    )


async def get_tracking_detail(
    session: AsyncSession,
    *,
    actor: AuthUser,
    target_user_id: int,
    stat_date: date,
) -> TeamTrackingDetailResponse:
    await sweep_stale_presence(session)
    member = await _require_scoped_member(session, actor, target_user_id=target_user_id)
    if member is None:
        raise LookupError("Tracked member not found in your scope.")

    await ensure_daily_member_stats_for_users(session, user_ids=[target_user_id], stat_date=stat_date)
    stats_rows = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id == target_user_id,
                DailyMemberStat.stat_date == stat_date,
            )
        )
    ).scalars().all()
    stats_map = {target_user_id: stats_rows[0]} if stats_rows else {}
    history_map = await _history_rows_by_user(session, user_ids=[target_user_id], end_date=stat_date)
    presence_map = await _presence_by_user(session, user_ids=[target_user_id])
    hierarchy_entries = await load_user_hierarchy_entries(session, [target_user_id])
    summary = await _build_member_summary(
        member=member,
        stat_date=stat_date,
        stats_map=stats_map,
        presence_map=presence_map,
        history_map=history_map,
        hierarchy_entries=hierarchy_entries,
    )

    history_rows = history_map.get(target_user_id, [])
    history_by_date = {row.stat_date.isoformat(): row for row in history_rows}
    trend: list[TeamTrackingTrendPoint] = []
    for idx in range(TREND_DAYS - 1, -1, -1):
        day = stat_date - timedelta(days=idx)
        row = history_by_date.get(day.isoformat())
        trend.append(
            TeamTrackingTrendPoint(
                date=day.isoformat(),
                login_count=int(row.login_count or 0) if row is not None else 0,
                calls_count=int(row.calls_count or 0) if row is not None else 0,
                leads_added_count=int(row.leads_added_count or 0) if row is not None else 0,
                followups_done_count=int(row.followups_done_count or 0) if row is not None else 0,
                consistency_score=int(row.consistency_score or 0) if row is not None else 0,
                consistency_band=(row.consistency_band or "low") if row is not None else "low",
            )
        )

    recent_activity_rows = (
        await session.execute(
            select(ActivityLog)
            .where(ActivityLog.user_id == target_user_id)
            .order_by(ActivityLog.created_at.desc())
            .limit(12)
        )
    ).scalars().all()
    recent_activity = [
        TeamTrackingActivityItem(
            action=row.action,
            occurred_at=row.created_at,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            meta=row.meta if isinstance(row.meta, dict) else None,
        )
        for row in recent_activity_rows
    ]
    return TeamTrackingDetailResponse(
        member=summary,
        trend=trend,
        recent_activity=recent_activity,
        date=stat_date.isoformat(),
    )
