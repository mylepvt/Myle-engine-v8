"""Work streak — consecutive IST days a member hits the daily call target.

Replaces the login streak as the streak we show and nudge on: opening the app
is not work, hitting the call target is. Bumped right after the call that
reaches the target; milestone days earn bonus XP.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.models.user import User
from app.services.live_metrics import fresh_call_counts_by_user, get_daily_call_target

STREAK_BONUS_DAYS = (3, 7, 14, 30)


def current_work_streak(user: User, today: date | None = None) -> int:
    """The streak as it stands now: alive if it was extended today or yesterday."""
    today = today or today_ist()
    last = user.work_streak_date
    if last is None or last < today - timedelta(days=1):
        return 0
    return int(user.work_streak or 0)


async def bump_work_streak_after_call(session: AsyncSession, user: User) -> int | None:
    """Extend the streak if this call made today's target. Returns the new streak
    the first time it moves today, else None. Caller commits."""
    today = today_ist()
    if user.work_streak_date == today:
        return None
    target = await get_daily_call_target(session)
    done = (await fresh_call_counts_by_user(session, [user.id], today)).get(user.id, 0)
    if done < target:
        return None

    streak = current_work_streak(user, today) + 1
    user.work_streak = streak
    user.work_streak_date = today
    user.work_streak_best = max(int(user.work_streak_best or 0), streak)

    if streak in STREAK_BONUS_DAYS:
        from app.services.wins import record_win
        from app.services.xp_service import grant_xp

        record_win(session, user_id=user.id, kind="streak", detail=str(streak))

        await grant_xp(session, user.id, f"streak_{streak}")
    return streak
