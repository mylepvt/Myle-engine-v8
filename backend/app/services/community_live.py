"""Community live pulse — lets every member see that MYLE is busy right now.

One snapshot for the whole community (same for every viewer):
- how many members are on the app right now (live presence heartbeats),
- totals for today and for the last 7 days (calls, follow-ups, members who worked,
  leads added) — the card shows the week when today is still quiet,
- the "15+ calls today" club (first names + call counts) to spur everyone else on,
- a feed of real recent actions over the last 24 hours: first name + what they did.

Everything is real data; nothing is padded. Privacy: never a lead's name, phone or
stage — only the member's first name. Copy is English (app UI rule). Admin and
removed accounts are not counted or shown.
"""

from __future__ import annotations

import time as _time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import distinct, func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.batch_share_link import BatchShareLink
from app.models.call_event import CallEvent
from app.models.day2_test_session import Day2TestSession
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.training_progress import TrainingProgress
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.models.win import Win
from app.models.xp_event import XpEvent
from app.services.live_metrics import ist_day_bounds
from app.services.team_tracking import PRESENCE_ONLINE_STALE_SECONDS
from app.services.wins import win_text

MEMBER_ROLES = ("leader", "team")
FEED_WINDOW = timedelta(hours=24)
GROUP_WINDOW = timedelta(hours=3)  # calls / new leads are grouped per member over this window
FEED_LIMIT = 15
PER_KIND_LIMIT = 10
WEEK_DAYS = 7
STAR_CALLS = 15  # "15+ calls today" club, shown to encourage everyone else
STAR_LIMIT = 10
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


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else f"{n} {many}"


def _batch_day(slot: str) -> str:
    return "Day 2" if slot.startswith("d2") else "Day 1"


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


async def _count(session: AsyncSession, stmt) -> int:
    return int((await session.execute(stmt)).scalar_one() or 0)


async def period_totals(session: AsyncSession, start: datetime, end: datetime) -> dict[str, int]:
    member = _member_filter()
    # Worked = logged a call or earned XP for real work (opening the app doesn't count).
    workers = union(
        select(CallEvent.user_id.label("uid")).where(CallEvent.called_at >= start, CallEvent.called_at < end),
        select(XpEvent.user_id.label("uid")).where(
            XpEvent.created_at >= start, XpEvent.created_at < end, XpEvent.action != "login_daily"
        ),
    ).subquery()
    return {
        "calls": await _count(
            session,
            select(func.count(CallEvent.id))
            .join(User, User.id == CallEvent.user_id)
            .where(CallEvent.called_at >= start, CallEvent.called_at < end, *member),
        ),
        "followups": await _count(
            session,
            select(func.count(FollowUp.id))
            .join(User, User.id == FollowUp.completed_by_user_id)
            .where(FollowUp.completed_at >= start, FollowUp.completed_at < end, *member),
        ),
        "members_worked": await _count(
            session,
            select(func.count(distinct(User.id))).join(workers, workers.c.uid == User.id).where(*member),
        ),
        "leads_added": await _count(
            session,
            select(func.count(Lead.id))
            .join(User, User.id == Lead.created_by_user_id)
            .where(Lead.created_at >= start, Lead.created_at < end, Lead.deleted_at.is_(None), *member),
        ),
    }


async def call_stars(session: AsyncSession, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Members with STAR_CALLS+ calls today, most calls first, with the time they crossed the mark."""
    rows = (
        await session.execute(
            select(User, func.count(CallEvent.id))
            .join(CallEvent, CallEvent.user_id == User.id)
            .where(CallEvent.called_at >= start, CallEvent.called_at < end, *_member_filter())
            .group_by(User.id)
            .having(func.count(CallEvent.id) >= STAR_CALLS)
            .order_by(func.count(CallEvent.id).desc(), User.id)
            .limit(STAR_LIMIT)
        )
    ).all()
    stars: list[dict[str, Any]] = []
    for user, n in rows:
        times = (
            await session.execute(
                select(CallEvent.called_at)
                .where(CallEvent.user_id == user.id, CallEvent.called_at >= start, CallEvent.called_at < end)
                .order_by(CallEvent.called_at)
                .offset(STAR_CALLS - 1)
                .limit(1)
            )
        ).scalar_one()
        stars.append({"user_id": user.id, "name": first_name(user), "calls": int(n), "crossed_at": _aware(times)})
    return stars


async def _feed(session: AsyncSession, now: datetime, stars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    member = _member_filter()
    since = now - FEED_WINDOW
    group_since = now - GROUP_WINDOW
    feed: list[dict[str, Any]] = []

    def add(kind: str, user: User, text: str, at: datetime) -> None:
        feed.append({"kind": kind, "user_id": user.id, "text": text, "at": _aware(at)})

    # Calls and new leads: one line per member for the last few hours ("Rahul made 4 calls").
    for user, n, last in (
        await session.execute(
            select(User, func.count(CallEvent.id), func.max(CallEvent.called_at))
            .join(CallEvent, CallEvent.user_id == User.id)
            .where(CallEvent.called_at >= group_since, *member)
            .group_by(User.id)
        )
    ).all():
        add("call", user, f"{first_name(user)} made {_plural(n, 'a call', 'calls')}", last)

    for user, n, last in (
        await session.execute(
            select(User, func.count(Lead.id), func.max(Lead.created_at))
            .join(Lead, Lead.created_by_user_id == User.id)
            .where(Lead.created_at >= group_since, Lead.deleted_at.is_(None), *member)
            .group_by(User.id)
        )
    ).all():
        add("lead", user, f"{first_name(user)} added {_plural(n, 'a new lead', 'new leads')}", last)

    for user, at in (
        await session.execute(
            select(User, FollowUp.completed_at)
            .join(FollowUp, FollowUp.completed_by_user_id == User.id)
            .where(FollowUp.completed_at >= since, *member)
            .order_by(FollowUp.completed_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("followup", user, f"{first_name(user)} completed a follow-up", at)

    for user, slot, at in (
        await session.execute(
            select(User, BatchShareLink.slot, BatchShareLink.used_at)
            .join(BatchShareLink, BatchShareLink.created_by_user_id == User.id)
            .where(BatchShareLink.used_at >= since, *member)
            .order_by(BatchShareLink.used_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("batch", user, f"{first_name(user)}'s prospect watched a {_batch_day(slot)} batch", at)

    for user, at in (
        await session.execute(
            select(User, Day2TestSession.submitted_at)
            .join(Day2TestSession, Day2TestSession.created_by_user_id == User.id)
            .where(
                Day2TestSession.status == "submitted",
                Day2TestSession.passed.is_(True),
                Day2TestSession.submitted_at >= since,
                *member,
            )
            .order_by(Day2TestSession.submitted_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("day2", user, f"{first_name(user)}'s prospect passed the Day 2 test", at)

    for user, day, at in (
        await session.execute(
            select(User, TrainingProgress.day_number, TrainingProgress.completed_at)
            .join(TrainingProgress, TrainingProgress.user_id == User.id)
            .where(TrainingProgress.completed.is_(True), TrainingProgress.completed_at >= since, *member)
            .order_by(TrainingProgress.completed_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("training", user, f"{first_name(user)} completed Day {day} of training", at)

    for user, at in (
        await session.execute(
            select(User, TrainingTestAttempt.attempted_at)
            .join(TrainingTestAttempt, TrainingTestAttempt.user_id == User.id)
            .where(TrainingTestAttempt.passed.is_(True), TrainingTestAttempt.attempted_at >= since, *member)
            .order_by(TrainingTestAttempt.attempted_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("certificate", user, f"{first_name(user)} earned the training certificate", at)

    for user, at in (
        await session.execute(
            select(User, XpEvent.created_at)
            .join(XpEvent, XpEvent.user_id == User.id)
            .where(XpEvent.action == "report_submitted", XpEvent.created_at >= since, *member)
            .order_by(XpEvent.created_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("report", user, f"{first_name(user)} submitted the daily report", at)

    for user, win in (
        await session.execute(
            select(User, Win)
            .join(Win, Win.user_id == User.id)
            .where(Win.created_at >= since, *member)
            .order_by(Win.created_at.desc())
            .limit(PER_KIND_LIMIT)
        )
    ).all():
        add("win", user, win_text(win.kind, first_name(user), win.detail), win.created_at)

    for star in stars:
        feed.append({
            "kind": "star",
            "user_id": star["user_id"],
            "text": f"{star['name']} crossed {STAR_CALLS} calls today",
            "at": star["crossed_at"],
        })

    feed.sort(key=lambda e: e["at"], reverse=True)
    return [{**e, "at": e["at"].isoformat()} for e in feed[:FEED_LIMIT]]


async def build_live_snapshot(session: AsyncSession, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    start, end = ist_day_bounds(today)
    week_start, _ = ist_day_bounds(today - timedelta(days=WEEK_DAYS - 1))

    online = await online_members(session, now)
    stars = await call_stars(session, start, end)
    return {
        "online_now": len(online),
        "online_names": [first_name(u) for u in online[:5]],
        "today": await period_totals(session, start, end),
        "week": await period_totals(session, week_start, end),
        "call_stars": [
            {"user_id": st["user_id"], "name": st["name"], "calls": st["calls"]} for st in stars
        ],
        "star_calls": STAR_CALLS,
        "feed": await _feed(session, now, stars),
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
