"""Community live pulse — lets every member see that MYLE is busy right now.

One snapshot for the whole community (same for every viewer):
- how many members are on the app right now (live presence heartbeats),
- today's totals (calls, follow-ups done, members who worked),
- a short feed of real recent actions: first name + what they did.

Privacy: never a lead's name, phone or stage — only the member's first name.
Copy is English (app UI rule). Admin accounts are not counted or shown.
"""

from __future__ import annotations

import time as _time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import distinct, func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.call_event import CallEvent
from app.models.follow_up import FollowUp
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.models.win import Win
from app.models.xp_event import XpEvent
from app.services.live_metrics import ist_day_bounds
from app.services.team_tracking import PRESENCE_ONLINE_STALE_SECONDS
from app.services.wins import win_text

MEMBER_ROLES = ("leader", "team")
CALL_WINDOW = timedelta(minutes=90)  # calls are grouped per member over this window
FEED_LIMIT = 12
CACHE_SECONDS = 20

_cache: tuple[float, dict[str, Any]] | None = None


def first_name(user: User) -> str:
    raw = (user.name or user.username or user.fbo_id or "A teammate").strip()
    return raw.split(" ")[0] or "A teammate"


def _member_filter():
    return (
        User.role.in_(MEMBER_ROLES),
        User.removed_at.is_(None),
        User.registration_status == "approved",
    )


def _aware(dt: datetime) -> datetime:
    """Aware UTC (SQLite hands back naive values); serialised after sorting."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def online_members(session: AsyncSession, now: datetime) -> list[User]:
    """Members with a live app session right now, most recently active first."""
    fresh = now - timedelta(seconds=PRESENCE_ONLINE_STALE_SECONDS)
    beat = (
        select(UserPresenceSession.user_id, func.max(UserPresenceSession.last_heartbeat_at).label("beat"))
        .where(
            UserPresenceSession.disconnected_at.is_(None),
            UserPresenceSession.last_heartbeat_at >= fresh,
        )
        .group_by(UserPresenceSession.user_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(User)
            .join(beat, beat.c.user_id == User.id)
            .where(*_member_filter())
            .order_by(beat.c.beat.desc(), User.id)
        )
    ).scalars().all()
    return list(rows)


async def build_live_snapshot(session: AsyncSession, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    start, end = ist_day_bounds(now.astimezone(IST).date())
    member = _member_filter()

    online = await online_members(session, now)

    calls_today = int(
        (
            await session.execute(
                select(func.count(CallEvent.id))
                .join(User, User.id == CallEvent.user_id)
                .where(CallEvent.called_at >= start, CallEvent.called_at < end, *member)
            )
        ).scalar_one()
        or 0
    )
    followups_today = int(
        (
            await session.execute(
                select(func.count(FollowUp.id))
                .join(User, User.id == FollowUp.completed_by_user_id)
                .where(FollowUp.completed_at >= start, FollowUp.completed_at < end, *member)
            )
        ).scalar_one()
        or 0
    )
    # Worked today = logged a call or earned XP for real work (opening the app doesn't count).
    workers = union(
        select(CallEvent.user_id.label("uid")).where(CallEvent.called_at >= start, CallEvent.called_at < end),
        select(XpEvent.user_id.label("uid")).where(
            XpEvent.created_at >= start, XpEvent.created_at < end, XpEvent.action != "login_daily"
        ),
    ).subquery()
    active_today = int(
        (
            await session.execute(
                select(func.count(distinct(User.id))).join(workers, workers.c.uid == User.id).where(*member)
            )
        ).scalar_one()
        or 0
    )

    feed: list[dict[str, Any]] = []

    # Calls: one line per member for the last 90 minutes ("Rahul made 4 calls").
    since = max(start, now - CALL_WINDOW)
    for user, n, last in (
        await session.execute(
            select(User, func.count(CallEvent.id), func.max(CallEvent.called_at))
            .join(CallEvent, CallEvent.user_id == User.id)
            .where(CallEvent.called_at >= since, CallEvent.called_at < end, *member)
            .group_by(User.id)
        )
    ).all():
        name = first_name(user)
        text = f"{name} made a call" if n == 1 else f"{name} made {n} calls"
        feed.append({"kind": "call", "user_id": user.id, "text": text, "at": _aware(last)})

    for user, at in (
        await session.execute(
            select(User, FollowUp.completed_at)
            .join(FollowUp, FollowUp.completed_by_user_id == User.id)
            .where(FollowUp.completed_at >= start, FollowUp.completed_at < end, *member)
            .order_by(FollowUp.completed_at.desc())
            .limit(FEED_LIMIT)
        )
    ).all():
        feed.append({"kind": "followup", "user_id": user.id, "text": f"{first_name(user)} completed a follow-up", "at": _aware(at)})

    for user, at in (
        await session.execute(
            select(User, XpEvent.created_at)
            .join(XpEvent, XpEvent.user_id == User.id)
            .where(
                XpEvent.action == "report_submitted",
                XpEvent.created_at >= start,
                XpEvent.created_at < end,
                *member,
            )
            .order_by(XpEvent.created_at.desc())
            .limit(FEED_LIMIT)
        )
    ).all():
        feed.append({"kind": "report", "user_id": user.id, "text": f"{first_name(user)} submitted the daily report", "at": _aware(at)})

    for user, win in (
        await session.execute(
            select(User, Win)
            .join(Win, Win.user_id == User.id)
            .where(Win.created_at >= start, Win.created_at < end, *member)
            .order_by(Win.created_at.desc())
            .limit(FEED_LIMIT)
        )
    ).all():
        feed.append({
            "kind": "win",
            "user_id": user.id,
            "text": win_text(win.kind, first_name(user), win.detail),
            "at": _aware(win.created_at),
        })

    feed.sort(key=lambda e: e["at"], reverse=True)
    feed = [{**e, "at": e["at"].isoformat()} for e in feed[:FEED_LIMIT]]
    return {
        "online_now": len(online),
        "online_names": [first_name(u) for u in online[:5]],
        "today": {
            "calls": calls_today,
            "followups": followups_today,
            "members_worked": active_today,
        },
        "feed": feed,
        "generated_at": now.isoformat(),
    }


async def get_live_snapshot(session: AsyncSession) -> dict[str, Any]:
    """Cached for a few seconds — every member polls the same community snapshot."""
    global _cache
    mono = _time.monotonic()
    if _cache is not None and mono - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    snapshot = await build_live_snapshot(session)
    _cache = (mono, snapshot)
    return snapshot
