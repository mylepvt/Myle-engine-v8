"""Today's closing list: Day 3 prospects who finished the interview and watched
today's 2 PM live session (leader ticks it after the Zoom) — not converted yet."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.downline import lead_visible_to_leader_clause
from app.services.live_metrics import ist_day_bounds

INTERVIEW = "day3_interview"
LIVE_SESSION = "day3_live_session"


async def _ticked_at(session: AsyncSession, lead_ids: list[int], task: str, since: datetime | None = None) -> dict[int, datetime]:
    """Latest time each lead's Day 3 ``task`` was ticked (from the activity log)."""
    stmt = select(ActivityLog.entity_id, ActivityLog.meta, ActivityLog.created_at).where(
        ActivityLog.action == "process.task_done",
        ActivityLog.entity_type == "lead",
        ActivityLog.entity_id.in_(lead_ids or [-1]),
    )
    if since is not None:
        stmt = stmt.where(ActivityLog.created_at >= since)
    out: dict[int, datetime] = {}
    for lead_id, meta, at in (await session.execute(stmt)).all():
        if (meta or {}).get("task") != task:
            continue
        at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
        if lead_id not in out or at > out[lead_id]:
            out[int(lead_id)] = at
    return out


async def closing_ready_today(
    session: AsyncSession, *, viewer_id: int, viewer_role: str, now: datetime | None = None
) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    stmt = select(Lead).where(
        Lead.status == "day3",
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
        Lead.in_pool.is_(False),
    )
    if viewer_role != "admin":
        stmt = stmt.where(lead_visible_to_leader_clause(viewer_id))
    leads = (await session.execute(stmt)).scalars().all()

    candidates = [
        lead
        for lead in leads
        if (d3 := dict((lead.process_tracking or {}).get("day3") or {})).get(INTERVIEW) and d3.get(LIVE_SESSION)
    ]
    ids = [lead.id for lead in candidates]
    day_start, _ = ist_day_bounds(today)
    watched = await _ticked_at(session, ids, LIVE_SESSION, since=day_start)  # today only
    interviewed = await _ticked_at(session, ids, INTERVIEW)

    ready: list[tuple[Lead, datetime | None, datetime]] = []
    for lead in candidates:
        if lead.id in watched:
            ready.append((lead, interviewed.get(lead.id), watched[lead.id]))

    people_ids = {i for l, *_ in ready for i in (l.owner_user_id, l.assigned_to_user_id) if i}
    names = {
        uid: (name or username or fbo)
        for uid, name, username, fbo in (
            await session.execute(
                select(User.id, User.name, User.username, User.fbo_id).where(User.id.in_(people_ids or [-1]))
            )
        ).all()
    }
    ready.sort(key=lambda r: r[2])
    return [
        {
            "lead_id": lead.id,
            "name": lead.name,
            "phone": lead.phone,
            "city": lead.city,
            "owner_name": names.get(lead.owner_user_id),
            "assigned_name": names.get(lead.assigned_to_user_id),
            "interview_at": interview_at.isoformat() if interview_at else None,
            "session_watched_at": watched_at.isoformat(),
        }
        for lead, interview_at, watched_at in ready
    ]
