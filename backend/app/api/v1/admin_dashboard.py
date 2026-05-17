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
from app.models.daily_report import DailyReport
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


# ---------------------------------------------------------------------------
# Online-now summary — who is online and working right now
# ---------------------------------------------------------------------------

class OnlineUserItem(BaseModel):
    user_id: int
    name: str
    fbo_id: str
    role: str
    presence_status: str
    calls_today: int
    leads_today: int
    is_working: bool


class OnlineNowResponse(BaseModel):
    online_count: int
    working_count: int
    not_working_count: int
    users: list[OnlineUserItem]


@router.get("/online-now", response_model=OnlineNowResponse)
async def admin_online_now(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> OnlineNowResponse:
    """Return all currently online users with today's work activity."""
    _require_admin(user)
    now = datetime.now(timezone.utc)
    today = _today_ist()

    presence_rows = (
        await session.execute(
            select(UserPresenceSession).where(
                UserPresenceSession.disconnected_at.is_(None),
            )
        )
    ).scalars().all()

    by_user: dict[int, list] = {}
    for row in presence_rows:
        by_user.setdefault(int(row.user_id), []).append(row)

    online_user_ids = [
        uid for uid, rows in by_user.items()
        if _effective_presence(rows, now=now) != "offline"
    ]

    if not online_user_ids:
        return OnlineNowResponse(online_count=0, working_count=0, not_working_count=0, users=[])

    user_rows = (
        await session.execute(
            select(User).where(
                User.id.in_(online_user_ids),
                User.role.in_(["leader", "team"]),
            )
        )
    ).scalars().all()

    stat_rows = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id.in_(online_user_ids),
                DailyMemberStat.stat_date == today,
            )
        )
    ).scalars().all()
    stats_map = {int(r.user_id): r for r in stat_rows}

    items: list[OnlineUserItem] = []
    for u in user_rows:
        uid = int(u.id)
        stat = stats_map.get(uid)
        calls_today = int(stat.calls_count or 0) if stat else 0
        leads_today = int(stat.leads_added_count or 0) if stat else 0
        presence = _effective_presence(by_user.get(uid, []), now=now)
        items.append(OnlineUserItem(
            user_id=uid,
            name=_leader_display_name(u),
            fbo_id=u.fbo_id or "",
            role=u.role or "team",
            presence_status=presence,
            calls_today=calls_today,
            leads_today=leads_today,
            is_working=calls_today > 0 or leads_today > 0,
        ))

    items.sort(key=lambda x: (0 if x.is_working else 1, x.name.lower()))
    working_count = sum(1 for x in items if x.is_working)

    return OnlineNowResponse(
        online_count=len(items),
        working_count=working_count,
        not_working_count=len(items) - working_count,
        users=items,
    )


# ---------------------------------------------------------------------------
# Today-pulse — calls, leads, reports, zero-activity members
# ---------------------------------------------------------------------------

class ReportStatusItem(BaseModel):
    user_id: int
    name: str
    fbo_id: str
    role: str
    submitted: bool
    calls_in_report: int


class ZeroActivityItem(BaseModel):
    user_id: int
    name: str
    fbo_id: str
    role: str
    presence_status: str


class TodayPulseResponse(BaseModel):
    calls_today: int
    leads_today: int
    flp_billing_count: int
    reports_submitted: int
    reports_total: int
    report_members: list[ReportStatusItem]
    zero_activity: list[ZeroActivityItem]


@router.get("/today-pulse", response_model=TodayPulseResponse)
async def admin_today_pulse(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TodayPulseResponse:
    """Single endpoint: calls, leads, reports submitted/not, zero-activity online members."""
    _require_admin(user)
    now = datetime.now(timezone.utc)
    today = _today_ist()
    start, end = _ist_day_bounds(today)

    # ── Calls today ──────────────────────────────────────────────────────────
    calls_r = await session.execute(
        select(func.count()).select_from(CallEvent).where(
            CallEvent.called_at >= start,
            CallEvent.called_at < end,
        )
    )
    calls_today = int(calls_r.scalar_one() or 0)

    # ── Leads added today (from daily_member_stat) ────────────────────────────
    leads_r = await session.execute(
        select(func.coalesce(func.sum(DailyMemberStat.leads_added_count), 0)).where(
            DailyMemberStat.stat_date == today,
        )
    )
    leads_today = int(leads_r.scalar_one() or 0)

    # ── Min. FLP Billing — leads currently at 'paid' stage ───────────────────
    flp_r = await session.execute(
        select(func.count()).select_from(Lead).where(
            Lead.status == "paid",
            Lead.deleted_at.is_(None),
            Lead.archived_at.is_(None),
            Lead.in_pool.is_(False),
        )
    )
    flp_billing_count = int(flp_r.scalar_one() or 0)

    # ── Report members: all approved team+leader vs who submitted ─────────────
    active_members = (
        await session.execute(
            select(User).where(
                User.role.in_(["leader", "team"]),
                User.registration_status == "approved",
            ).order_by(User.name.asc())
        )
    ).scalars().all()

    submitted_user_ids: set[int] = set()
    report_calls_map: dict[int, int] = {}
    report_rows = (
        await session.execute(
            select(DailyReport).where(DailyReport.report_date == today)
        )
    ).scalars().all()
    for r in report_rows:
        submitted_user_ids.add(int(r.user_id))
        report_calls_map[int(r.user_id)] = int(r.total_calling or 0)

    report_members: list[ReportStatusItem] = []
    for m in active_members:
        mid = int(m.id)
        submitted = mid in submitted_user_ids
        report_members.append(ReportStatusItem(
            user_id=mid,
            name=_leader_display_name(m),
            fbo_id=m.fbo_id or "",
            role=m.role or "team",
            submitted=submitted,
            calls_in_report=report_calls_map.get(mid, 0),
        ))

    # submitted first, then by name
    report_members.sort(key=lambda x: (0 if x.submitted else 1, x.name.lower()))

    # ── Zero-activity: online now but 0 calls + 0 leads today ────────────────
    presence_rows = (
        await session.execute(
            select(UserPresenceSession).where(
                UserPresenceSession.disconnected_at.is_(None),
            )
        )
    ).scalars().all()
    by_user: dict[int, list] = {}
    for row in presence_rows:
        by_user.setdefault(int(row.user_id), []).append(row)

    online_ids = {
        uid for uid, rows in by_user.items()
        if _effective_presence(rows, now=now) != "offline"
    }

    stat_map: dict[int, DailyMemberStat] = {}
    if online_ids:
        stat_rows = (
            await session.execute(
                select(DailyMemberStat).where(
                    DailyMemberStat.user_id.in_(online_ids),
                    DailyMemberStat.stat_date == today,
                )
            )
        ).scalars().all()
        stat_map = {int(r.user_id): r for r in stat_rows}

    member_map = {int(m.id): m for m in active_members}

    zero_activity: list[ZeroActivityItem] = []
    for uid in online_ids:
        m = member_map.get(uid)
        if m is None:
            continue
        stat = stat_map.get(uid)
        calls = int(stat.calls_count or 0) if stat else 0
        leads = int(stat.leads_added_count or 0) if stat else 0
        if calls == 0 and leads == 0:
            presence = _effective_presence(by_user.get(uid, []), now=now)
            zero_activity.append(ZeroActivityItem(
                user_id=uid,
                name=_leader_display_name(m),
                fbo_id=m.fbo_id or "",
                role=m.role or "team",
                presence_status=presence,
            ))

    zero_activity.sort(key=lambda x: x.name.lower())

    return TodayPulseResponse(
        calls_today=calls_today,
        leads_today=leads_today,
        flp_billing_count=flp_billing_count,
        reports_submitted=len(submitted_user_ids),
        reports_total=len(active_members),
        report_members=report_members,
        zero_activity=zero_activity,
    )
