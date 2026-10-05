"""15+ club alert: when someone crosses 15 calls today, nudge everyone who hasn't yet.

- Recipients: report-eligible members still under 15 calls today.
- At most one alert per member per day (logged in activity_log as ``engagement.star_alert``).
- Only 10:00–20:00 IST.

Copy is English (app UI rule).
"""

from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.user import User
from app.services.community_live import STAR_CALLS, call_stars
from app.services.live_metrics import ist_day_bounds

STAR_ALERT_ACTION = "engagement.star_alert"
WINDOW_START = time(10, 0)
WINDOW_END = time(20, 0)

SendPush = Callable[[AsyncSession, User, str, str], Awaitable[bool]]


def in_star_alert_window(now: datetime) -> bool:
    return WINDOW_START <= now.astimezone(IST).time() < WINDOW_END


def star_alert_message(star_names: list[str], my_calls: int) -> tuple[str, str]:
    """(title, body). star_names: most recent crosser first."""
    lead = star_names[0]
    others = len(star_names) - 1
    if others == 0:
        title = f"🔥 {lead} just crossed {STAR_CALLS} calls today"
    else:
        title = f"🔥 {lead} and {others} other{'s' if others > 1 else ''} crossed {STAR_CALLS} calls today"
    if my_calls == 0:
        body = f"How many have you made? Start now and join the {STAR_CALLS}+ club."
    else:
        body = (
            f"How many have you made? You're on {my_calls} — "
            f"{STAR_CALLS - my_calls} more to join the {STAR_CALLS}+ club."
        )
    return title, body


async def run_star_alert(
    session: AsyncSession, users: list[User], now: datetime, send: SendPush
) -> tuple[int, int]:
    """Send the alert to everyone eligible. Returns (targeted, sent); caller commits."""
    start, end = ist_day_bounds(now.astimezone(IST).date())
    stars = await call_stars(session, start, end)
    if not stars or not users:
        return 0, 0
    stars.sort(key=lambda s: s["crossed_at"], reverse=True)
    star_ids = {s["user_id"] for s in stars}

    ids = [u.id for u in users]
    calls = dict(
        (
            await session.execute(
                select(CallEvent.user_id, func.count(CallEvent.id))
                .where(CallEvent.user_id.in_(ids), CallEvent.called_at >= start, CallEvent.called_at < end)
                .group_by(CallEvent.user_id)
            )
        ).all()
    )
    already = set(
        (
            await session.execute(
                select(ActivityLog.user_id).where(
                    ActivityLog.user_id.in_(ids),
                    ActivityLog.action == STAR_ALERT_ACTION,
                    ActivityLog.created_at >= start,
                )
            )
        ).scalars().all()
    )

    targeted = sent = 0
    for user in users:
        my_calls = int(calls.get(user.id, 0))
        if user.id in star_ids or user.id in already or my_calls >= STAR_CALLS:
            continue
        names = [s["name"] for s in stars if s["user_id"] != user.id]
        if not names:
            continue
        targeted += 1
        title, body = star_alert_message(names, my_calls)
        if await send(session, user, title, body):
            session.add(
                ActivityLog(
                    user_id=user.id,
                    action=STAR_ALERT_ACTION,
                    entity_type="user",
                    entity_id=user.id,
                    meta={"stars": len(names)},
                    created_at=now.astimezone(timezone.utc),
                )
            )
            sent += 1
    return targeted, sent
