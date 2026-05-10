"""Admin dashboard — leader health cards and today's live metrics."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.call_event import CallEvent
from app.models.daily_member_stat import DailyMemberStat
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.services.user_hierarchy import recursive_downline_user_ids

IST = ZoneInfo("Asia/Kolkata")
_PRESENCE_STALE_SECONDS = 45

router = APIRouter()


def _ist_day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def _today_ist() -> date:
    return datetime.now(IST).date()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")


def _leader_display_name(user: User) -> str:
    if user.name and user.name.strip():
        return user.name.strip()
    if user.username and user.username.strip():
        return user.username.strip()
    return user.fbo_id


def _effective_presence(rows: list, *, now: datetime) -> str:
    order = {"offline": 0, "idle": 1, "online": 2}
    best = "offline"
    for row in rows:
        if row.disconnected_at is not None:
            continue
        hb = row.last_heartbeat_at
        if hb is None:
            continue
        if hb.tzinfo is None:
            hb = hb.replace(tzinfo=timezone.utc)
        if hb < now - timedelta(seconds=_PRESENCE_STALE_SECONDS):
            continue
        status = (row.status or "").strip().lower()
        effective = "idle" if status == "idle" else "online"
        if order[effective] > order[best]:
            best = effective
    return best


class LeaderHealthItem(BaseModel):
    leader_id: int
    leader_name: str
    fbo_id: str
    presence_status: str
    personal_calls_today: int
    personal_consistency_score: int
    personal_consistency_band: str
    personal_leads_added: int
    personal_followups_done: int
    team_size: int
    team_calls_today: int
    team_avg_score: float
    team_online_count: int
    day2_leads_count: int


class LeaderHealthResponse(BaseModel):
    date: str
    leaders: list[LeaderHealthItem]


@router.get("/leader-health", response_model=LeaderHealthResponse)
async def admin_leader_health(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stat_date: date | None = Query(default=None, alias="date"),
) -> LeaderHealthResponse:
    """Return per-leader health card data for the admin dashboard."""
    _require_admin(user)
    report_date = stat_date or _today_ist()
    start, end = _ist_day_bounds(report_date)
    now = datetime.now(timezone.utc)

    leaders = (
        await session.execute(
            select(User)
            .where(
                User.role == "leader",
                User.registration_status == "approved",
            )
            .order_by(User.name.asc(), User.id.asc())
        )
    ).scalars().all()

    leader_ids = [int(ldr.id) for ldr in leaders]
    if not leader_ids:
        return LeaderHealthResponse(date=report_date.isoformat(), leaders=[])

    # Bulk-load presence for all leaders
    presence_rows = (
        await session.execute(
            select(UserPresenceSession).where(UserPresenceSession.user_id.in_(leader_ids))
        )
    ).scalars().all()
    presence_by_leader: dict[int, list] = {}
    for row in presence_rows:
        presence_by_leader.setdefault(int(row.user_id), []).append(row)

    # Bulk-load daily stats for all leaders
    leader_stat_rows = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id.in_(leader_ids),
                DailyMemberStat.stat_date == report_date,
            )
        )
    ).scalars().all()
    leader_stats_map: dict[int, DailyMemberStat] = {int(r.user_id): r for r in leader_stat_rows}

    items: list[LeaderHealthItem] = []

    for leader in leaders:
        lid = int(leader.id)

        # Personal stats from daily_member_stat
        stat = leader_stats_map.get(lid)
        personal_calls = int(stat.calls_count or 0) if stat else 0
        personal_score = int(stat.consistency_score or 0) if stat else 0
        personal_band = (stat.consistency_band or "low") if stat else "low"
        personal_leads = int(stat.leads_added_count or 0) if stat else 0
        personal_followups = int(stat.followups_done_count or 0) if stat else 0

        # Presence
        presence_status = _effective_presence(presence_by_leader.get(lid, []), now=now)

        # Downline team
        downline_ids = await recursive_downline_user_ids(session, lid)
        team_size = len(downline_ids)

        if downline_ids:
            # Team calls today
            team_calls_r = await session.execute(
                select(func.count()).select_from(CallEvent).where(
                    CallEvent.user_id.in_(downline_ids),
                    CallEvent.called_at >= start,
                    CallEvent.called_at < end,
                )
            )
            team_calls_today = int(team_calls_r.scalar_one() or 0)

            # Team average consistency score
            team_stat_rows = (
                await session.execute(
                    select(DailyMemberStat).where(
                        DailyMemberStat.user_id.in_(downline_ids),
                        DailyMemberStat.stat_date == report_date,
                    )
                )
            ).scalars().all()
            team_avg_score = (
                sum(int(r.consistency_score or 0) for r in team_stat_rows) / len(team_stat_rows)
                if team_stat_rows
                else 0.0
            )

            # Team online members
            team_presence_rows = (
                await session.execute(
                    select(UserPresenceSession).where(
                        UserPresenceSession.user_id.in_(downline_ids)
                    )
                )
            ).scalars().all()
            seen_online: set[int] = set()
            online_by_member: dict[int, list] = {}
            for row in team_presence_rows:
                online_by_member.setdefault(int(row.user_id), []).append(row)
            for mid, rows in online_by_member.items():
                if _effective_presence(rows, now=now) != "offline":
                    seen_online.add(mid)
            team_online_count = len(seen_online)

            # Day2 leads under this leader's scope (leader + team)
            scope_ids = downline_ids + [lid]
        else:
            team_calls_today = 0
            team_avg_score = 0.0
            team_online_count = 0
            scope_ids = [lid]

        day2_r = await session.execute(
            select(func.count()).select_from(Lead).where(
                Lead.status == "day2",
                Lead.assigned_to_user_id.in_(scope_ids),
                Lead.deleted_at.is_(None),
                Lead.archived_at.is_(None),
                Lead.in_pool.is_(False),
            )
        )
        day2_leads_count = int(day2_r.scalar_one() or 0)

        items.append(
            LeaderHealthItem(
                leader_id=lid,
                leader_name=_leader_display_name(leader),
                fbo_id=leader.fbo_id,
                presence_status=presence_status,
                personal_calls_today=personal_calls,
                personal_consistency_score=personal_score,
                personal_consistency_band=personal_band,
                personal_leads_added=personal_leads,
                personal_followups_done=personal_followups,
                team_size=team_size,
                team_calls_today=team_calls_today,
                team_avg_score=round(team_avg_score, 1),
                team_online_count=team_online_count,
                day2_leads_count=day2_leads_count,
            )
        )

    items.sort(
        key=lambda x: (
            0 if x.presence_status == "online" else 1 if x.presence_status == "idle" else 2,
            -x.personal_consistency_score,
            x.leader_name.lower(),
        )
    )

    return LeaderHealthResponse(date=report_date.isoformat(), leaders=items)
