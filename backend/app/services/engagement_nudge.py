"""Inactivity nudges: pull an idle member back with the one message most likely
to grab them (someone just passed you, streak at risk, level within reach, …).

Guard-rails keep it from becoming noise that people mute:
- only 11:00–16:30 IST (the 09:00 plan / 17:00 call-target / 20:30 recap cover the rest)
- only after 2h with no work today (calls / XP-earning actions; opening the app doesn't count)
- only when there is work to do (leads to call or follow-ups due)
- never while the member has the app open (they can already see the live pulse)
- at most 2 a day, 3h apart, never the same kind twice in a day

Copy is English (app UI rule). Sent nudges are logged in activity_log as
``engagement.nudge`` with ``meta.type`` so the caps survive restarts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.person_name import person_name
from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.user import User
from app.models.xp_event import XpEvent
from app.services.community_live import first_name, online_members
from app.services.engagement_digest import build_morning_plans
from app.services.live_metrics import ist_day_bounds
from app.services.work_streak import current_work_streak
from app.services.xp_service import NEXT_LEVEL_XP, XP_TABLE, _calculate_level

NUDGE_ACTION = "engagement.nudge"
WINDOW_START = time(11, 0)
WINDOW_END = time(16, 30)
IDLE_AFTER = timedelta(hours=2)
MIN_GAP = timedelta(hours=3)
MAX_PER_DAY = 2
REACHABLE_RIVAL_XP = 40
LEVEL_NEAR_XP = 30
TEAM_BUZZ_CALLS = 10
LIVE_MIN_ONLINE = 3  # "N teammates are working right now" needs a real crowd


@dataclass
class NudgeContext:
    last_work_at: datetime | None
    new_leads: int
    followups_due: int
    streak: int
    calls_today: int
    rival_name: str | None = None  # person directly above on today's XP board
    rival_gap_xp: int = 0
    next_level: str | None = None
    xp_to_next_level: int | None = None
    team_calls_recent: int = 0
    online: bool = False  # has the app open right now
    live_online: int = 0  # other members on the app right now
    live_names: list[str] = field(default_factory=list)
    sent_today: list[tuple[str, datetime]] = field(default_factory=list)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def in_nudge_window(now: datetime) -> bool:
    local = now.astimezone(IST).time()
    return WINDOW_START <= local <= WINDOW_END


def pick_nudge(ctx: NudgeContext, now: datetime) -> tuple[str, str, str] | None:
    """(kind, title, body) for this member right now, or None to stay quiet."""
    if ctx.online:
        return None
    if ctx.last_work_at is not None and now - ctx.last_work_at < IDLE_AFTER:
        return None
    if ctx.new_leads + ctx.followups_due == 0:
        return None  # nothing they could act on
    if len(ctx.sent_today) >= MAX_PER_DAY:
        return None
    if ctx.sent_today and now - max(at for _, at in ctx.sent_today) < MIN_GAP:
        return None
    used = {kind for kind, _ in ctx.sent_today}

    candidates: list[tuple[str, str, str]] = []
    if ctx.rival_name and 0 < ctx.rival_gap_xp <= REACHABLE_RIVAL_XP:
        calls = max(1, math.ceil((ctx.rival_gap_xp + 1) / XP_TABLE["call_logged"]))
        candidates.append((
            "overtaken",
            "You just got passed",
            f"{ctx.rival_name} just passed you on today's leaderboard. "
            f"{_plural(calls, 'call')} puts you back ahead.",
        ))
    if ctx.streak >= 2 and ctx.calls_today == 0:
        candidates.append((
            "streak",
            "Don't lose your streak",
            f"Your {ctx.streak}-day streak ends tonight unless you log a call.",
        ))
    if ctx.live_online >= LIVE_MIN_ONLINE:
        names = ctx.live_names[:2]
        others = ctx.live_online - len(names)
        who = " and ".join(names) if not others else f"{', '.join(names)} and {_plural(others, 'other')}"
        candidates.append((
            "live",
            f"{ctx.live_online} teammates are working right now",
            f"{who} are on MYLE right now. Jump in and make your calls.",
        ))
    if ctx.next_level and ctx.xp_to_next_level is not None and 0 < ctx.xp_to_next_level <= LEVEL_NEAR_XP:
        candidates.append((
            "level",
            f"So close to {ctx.next_level.title()}",
            f"You're {ctx.xp_to_next_level} XP away from {ctx.next_level.title()} level. A few calls gets you there.",
        ))
    if ctx.new_leads:
        candidates.append((
            "leads",
            f"{_plural(ctx.new_leads, 'new lead')} waiting",
            "Fresh leads go cold fast — call them while they still remember you.",
        ))
    if ctx.followups_due:
        candidates.append((
            "followups",
            f"{_plural(ctx.followups_due, 'follow-up')} due",
            "They're expecting your call. A quick follow-up now keeps them warm.",
        ))
    if ctx.team_calls_recent >= TEAM_BUZZ_CALLS:
        candidates.append((
            "team",
            "Your team is on a roll",
            f"Your teammates logged {ctx.team_calls_recent} calls in the last 2 hours. Jump in.",
        ))
    return next((c for c in candidates if c[0] not in used), None)


async def build_nudge_contexts(
    session: AsyncSession, users: list[User], now: datetime
) -> dict[int, NudgeContext]:
    ids = [u.id for u in users]
    if not ids:
        return {}
    today = now.astimezone(IST).date()
    start, end = ist_day_bounds(today)

    last_call = dict(
        (
            await session.execute(
                select(CallEvent.user_id, func.max(CallEvent.called_at))
                .where(CallEvent.user_id.in_(ids), CallEvent.called_at >= start, CallEvent.called_at < end)
                .group_by(CallEvent.user_id)
            )
        ).all()
    )
    calls_today = dict(
        (
            await session.execute(
                select(CallEvent.user_id, func.count(CallEvent.id))
                .where(CallEvent.user_id.in_(ids), CallEvent.called_at >= start, CallEvent.called_at < end)
                .group_by(CallEvent.user_id)
            )
        ).all()
    )
    xp_rows = (
        await session.execute(
            select(XpEvent.user_id, func.sum(XpEvent.xp), func.max(XpEvent.created_at))
            .where(XpEvent.user_id.in_(ids), XpEvent.created_at >= start, XpEvent.created_at < end)
            .group_by(XpEvent.user_id)
        )
    ).all()
    xp_today = {int(uid): int(xp or 0) for uid, xp, _ in xp_rows}
    # Opening the app (login_daily XP) is not work; only real actions reset "idle".
    last_work_xp = dict(
        (
            await session.execute(
                select(XpEvent.user_id, func.max(XpEvent.created_at))
                .where(
                    XpEvent.user_id.in_(ids),
                    XpEvent.created_at >= start,
                    XpEvent.created_at < end,
                    XpEvent.action != "login_daily",
                )
                .group_by(XpEvent.user_id)
            )
        ).all()
    )
    team_calls_recent = int(
        (
            await session.execute(
                select(func.count(CallEvent.id)).where(
                    CallEvent.user_id.in_(ids), CallEvent.called_at >= now - timedelta(hours=2)
                )
            )
        ).scalar_one()
        or 0
    )
    sent: dict[int, list[tuple[str, datetime]]] = {}
    for uid, meta, at in (
        await session.execute(
            select(ActivityLog.user_id, ActivityLog.meta, ActivityLog.created_at).where(
                ActivityLog.user_id.in_(ids),
                ActivityLog.action == NUDGE_ACTION,
                ActivityLog.created_at >= start,
            )
        )
    ).all():
        sent.setdefault(int(uid), []).append((str((meta or {}).get("type", "")), _aware(at)))

    online_now = await online_members(session, now)
    online_ids = {u.id for u in online_now}

    plans = await build_morning_plans(session, users, today)
    names = {u.id: person_name(u.name or u.username or u.fbo_id or "").split(" ")[0] for u in users}
    board = sorted((uid for uid, xp in xp_today.items() if xp > 0), key=lambda uid: -xp_today[uid])

    contexts: dict[int, NudgeContext] = {}
    for u in users:
        last_times = [t for t in (last_call.get(u.id), last_work_xp.get(u.id)) if t is not None]
        mine = xp_today.get(u.id, 0)
        rival_name, gap = None, 0
        above = [uid for uid in board if xp_today[uid] > mine]
        if above:
            rival = above[-1]  # the person directly above me
            rival_name, gap = names.get(rival) or None, xp_today[rival] - mine
        level = _calculate_level(int(u.xp_total or 0))
        next_xp = NEXT_LEVEL_XP.get(level)
        next_level = _calculate_level(next_xp) if next_xp else None
        contexts[u.id] = NudgeContext(
            last_work_at=max(_aware(t) for t in last_times) if last_times else None,
            new_leads=plans[u.id].new_leads,
            followups_due=plans[u.id].followups_due,
            streak=current_work_streak(u, today),
            calls_today=int(calls_today.get(u.id, 0)),
            rival_name=rival_name,
            rival_gap_xp=gap,
            next_level=next_level,
            xp_to_next_level=(next_xp - int(u.xp_total or 0)) if next_xp else None,
            # Idle members made no calls in this window, so this is everyone else's.
            team_calls_recent=team_calls_recent,
            online=u.id in online_ids,
            live_online=len(online_ids - {u.id}),
            live_names=[first_name(o) for o in online_now if o.id != u.id][:2],
            sent_today=sent.get(u.id, []),
        )
    return contexts


def _aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC like the rest of the app."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
