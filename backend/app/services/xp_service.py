"""Anti-cheat XP service for Myle Community.

Monthly season reset
────────────────────
Every user's XP belongs to a "season" (year + month).  On the first XP-related
action in a new calendar month we:
  1. Archive the previous season's final XP + level into xp_monthly_archive.
  2. Reset xp_total → 0, xp_level → 'rookie', clear xp_events for that user.
  3. Update xp_season_year / xp_season_month to the current month.

This is a lazy reset — no cron job needed.  Admins can also trigger a manual
reset via the admin endpoint.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.models.xp_monthly_archive import XpMonthlyArchive
from app.services.push_service import send_push_to_user

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

XP_TABLE: dict[str, int] = {
    "login_daily": 5,
    "report_submitted": 20,
    "lead_contacted": 10,
    "followup_completed": 15,
    "lead_won": 100,
}

DAILY_CAP = 300
PER_LEAD_DAILY_ACTIONS = {"followup_completed"}

LEVEL_THRESHOLDS = [
    (1000, "legend"),
    (600, "elite"),
    (300, "pro"),
    (100, "agent"),
    (0, "rookie"),
]

NEXT_LEVEL_XP = {
    "rookie": 100,
    "agent": 300,
    "pro": 600,
    "elite": 1000,
    "legend": None,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _calculate_level(xp_total: int) -> str:
    for threshold, label in LEVEL_THRESHOLDS:
        if xp_total >= threshold:
            return label
    return "rookie"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today_utc() -> date:
    return _now_utc().date()


async def _today_xp(session: AsyncSession, user_id: int) -> int:
    today = _today_utc()
    result = await session.execute(
        select(func.coalesce(func.sum(XpEvent.xp), 0)).where(
            XpEvent.user_id == user_id,
            func.date(XpEvent.created_at) == today,
        )
    )
    return int(result.scalar_one())


async def _already_granted_today(
    session: AsyncSession,
    user_id: int,
    action: str,
    lead_id: Optional[int],
) -> bool:
    today = _today_utc()
    q = select(func.count()).where(
        XpEvent.user_id == user_id,
        XpEvent.action == action,
        func.date(XpEvent.created_at) == today,
    )
    if lead_id is not None:
        q = q.where(XpEvent.lead_id == lead_id)
    count = int((await session.execute(q)).scalar_one())
    return count > 0


async def _already_granted_ever(
    session: AsyncSession,
    *,
    action: str,
    lead_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> bool:
    q = select(func.count()).where(XpEvent.action == action)
    if lead_id is not None:
        q = q.where(XpEvent.lead_id == lead_id)
    if user_id is not None:
        q = q.where(XpEvent.user_id == user_id)
    count = int((await session.execute(q)).scalar_one())
    return count > 0


# ---------------------------------------------------------------------------
# Monthly season reset
# ---------------------------------------------------------------------------

async def _maybe_reset_season(session: AsyncSession, user: User) -> None:
    """If the user's stored season != current month, archive + reset."""
    now = _now_utc()
    current_year = now.year
    current_month = now.month

    season_year = user.xp_season_year
    season_month = user.xp_season_month

    # First ever XP action — just stamp the season, no archive needed
    if season_year is None or season_month is None:
        user.xp_season_year = current_year
        user.xp_season_month = current_month
        return

    # Same month — nothing to do
    if season_year == current_year and season_month == current_month:
        return

    # New month → archive previous season
    prev_xp = user.xp_total or 0
    prev_level = _calculate_level(prev_xp)

    # Upsert archive row (ignore if already archived by a concurrent reset)
    existing = (await session.execute(
        select(XpMonthlyArchive).where(
            XpMonthlyArchive.user_id == user.id,
            XpMonthlyArchive.year == season_year,
            XpMonthlyArchive.month == season_month,
        )
    )).scalar_one_or_none()

    if existing is None:
        archive = XpMonthlyArchive(
            user_id=user.id,
            year=season_year,
            month=season_month,
            final_xp=prev_xp,
            final_level=prev_level,
        )
        session.add(archive)

    # Delete all xp_events for this user (clean slate for new season)
    await session.execute(
        delete(XpEvent).where(XpEvent.user_id == user.id)
    )

    # Reset user XP
    user.xp_total = 0
    user.xp_level = "rookie"
    user.xp_season_year = current_year
    user.xp_season_month = current_month

    await session.flush()


# ---------------------------------------------------------------------------
# Core XP operations
# ---------------------------------------------------------------------------

async def grant_xp(
    session: AsyncSession,
    user_id: int,
    action: str,
    lead_id: Optional[int] = None,
) -> Optional[int]:
    """Grant XP for an action. Returns xp granted or None if blocked."""
    xp_amount = XP_TABLE.get(action)
    if xp_amount is None:
        return None

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None

    # Admin excluded
    if user.role == "admin":
        return None

    # Monthly season check — reset if new month
    await _maybe_reset_season(session, user)

    # Login/report actions are single-claim per day even if callers retry.
    if action in {"login_daily", "report_submitted"}:
        if await _already_granted_today(session, user_id, action, None):
            return None

    # First-contact XP is a one-time reward for the lead, not something that
    # can be farmed by bouncing the status back and forth.
    if action == "lead_contacted":
        if lead_id is None:
            return None
        if await _already_granted_ever(session, action=action, lead_id=lead_id):
            return None

    # lead_won anti-cheat: lead must be >24h old
    if action == "lead_won":
        if lead_id is None:
            return None
        lead = (await session.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
        if lead is None:
            return None
        age = _now_utc() - lead.created_at.replace(tzinfo=timezone.utc)
        if age < timedelta(hours=24):
            return None
        if await _already_granted_ever(session, action=action, lead_id=lead_id):
            return None

    # Per-lead per-day cap
    if action in PER_LEAD_DAILY_ACTIONS and lead_id is not None:
        if await _already_granted_today(session, user_id, action, lead_id):
            return None

    # Daily cap
    daily_xp = await _today_xp(session, user_id)
    if daily_xp >= DAILY_CAP:
        return None

    actual_xp = min(xp_amount, DAILY_CAP - daily_xp)

    event = XpEvent(user_id=user_id, action=action, xp=actual_xp, lead_id=lead_id)
    session.add(event)

    prev_level = user.xp_level or "rookie"
    user.xp_total = (user.xp_total or 0) + actual_xp
    user.xp_level = _calculate_level(user.xp_total)

    if user.xp_level != prev_level:
        try:
            await send_push_to_user(
                session,
                user.id,
                title="Level Up! 🎉",
                body=f"You reached {user.xp_level.title()} level. Keep it up!",
                url="/dashboard",
            )
        except Exception:
            pass

    await session.flush()
    return actual_xp


async def revoke_won_xp(session: AsyncSession, lead_id: int) -> None:
    """Delete all lead_won XP events for a lead and deduct from each user total."""
    rows = (
        await session.execute(
            select(XpEvent).where(
                XpEvent.action == "lead_won",
                XpEvent.lead_id == lead_id,
            )
        )
    ).scalars().all()

    if not rows:
        return

    total_revoke_by_user: dict[int, int] = defaultdict(int)
    for event in rows:
        total_revoke_by_user[int(event.user_id)] += int(event.xp)

    await session.execute(
        delete(XpEvent).where(
            XpEvent.action == "lead_won",
            XpEvent.lead_id == lead_id,
        )
    )

    if total_revoke_by_user:
        users = (
            await session.execute(
                select(User).where(User.id.in_(tuple(total_revoke_by_user.keys()))),
            )
        ).scalars().all()
        for user in users:
            total_revoke = int(total_revoke_by_user.get(int(user.id), 0))
            if total_revoke <= 0:
                continue
            user.xp_total = max(0, (user.xp_total or 0) - total_revoke)
            user.xp_level = _calculate_level(user.xp_total)

    await session.flush()


# ---------------------------------------------------------------------------
# Admin manual reset (for testing or emergency)
# ---------------------------------------------------------------------------

async def admin_force_reset_all(session: AsyncSession) -> int:
    """Archive + reset XP for ALL users. Returns count of users reset."""
    now = _now_utc()
    users = (await session.execute(
        select(User).where(User.role != "admin")
    )).scalars().all()

    reset_count = 0
    for user in users:
        if (user.xp_total or 0) == 0:
            continue  # nothing to archive

        existing = (await session.execute(
            select(XpMonthlyArchive).where(
                XpMonthlyArchive.user_id == user.id,
                XpMonthlyArchive.year == now.year,
                XpMonthlyArchive.month == now.month,
            )
        )).scalar_one_or_none()

        if existing is None:
            archive = XpMonthlyArchive(
                user_id=user.id,
                year=now.year,
                month=now.month,
                final_xp=user.xp_total or 0,
                final_level=_calculate_level(user.xp_total or 0),
            )
            session.add(archive)

        await session.execute(delete(XpEvent).where(XpEvent.user_id == user.id))
        user.xp_total = 0
        user.xp_level = "rookie"
        user.xp_season_year = now.year
        user.xp_season_month = now.month
        reset_count += 1

    await session.flush()
    return reset_count


# ---------------------------------------------------------------------------
# Read queries
# ---------------------------------------------------------------------------

async def get_user_xp_summary(session: AsyncSession, user_id: int) -> dict:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return {}

    # Lazy season check on read too (so dashboard is always fresh)
    await _maybe_reset_season(session, user)

    daily_xp = await _today_xp(session, user_id)
    xp_total = user.xp_total or 0
    level = _calculate_level(xp_total)
    next_xp = NEXT_LEVEL_XP.get(level)

    if next_xp is None:
        progress_pct = 100.0
    else:
        prev_threshold = 0
        for threshold, label in reversed(LEVEL_THRESHOLDS):
            if label == level:
                prev_threshold = threshold
                break
        span = next_xp - prev_threshold
        progress_pct = round(min(100.0, (xp_total - prev_threshold) / span * 100), 1) if span > 0 else 100.0

    return {
        "xp_total": xp_total,
        "level": level,
        "daily_xp": daily_xp,
        "daily_cap": DAILY_CAP,
        "streak": user.login_streak or 0,
        "next_level_xp": next_xp,
        "progress_pct": progress_pct,
        "season_year": user.xp_season_year,
        "season_month": user.xp_season_month,
    }


async def get_user_xp_history(session: AsyncSession, user_id: int) -> list[dict]:
    """Past monthly archive for a user, newest first."""
    rows = (
        await session.execute(
            select(XpMonthlyArchive)
            .where(XpMonthlyArchive.user_id == user_id)
            .order_by(XpMonthlyArchive.year.desc(), XpMonthlyArchive.month.desc())
        )
    ).scalars().all()
    return [
        {"year": r.year, "month": r.month, "final_xp": r.final_xp, "final_level": r.final_level}
        for r in rows
    ]


async def get_leaderboard(session: AsyncSession, limit: int = 10) -> list[dict]:
    rows = (
        await session.execute(
            select(User)
            .where(User.role != "admin")
            .order_by(User.xp_total.desc())
            .limit(limit)
        )
    ).scalars().all()

    result = []
    for rank, user in enumerate(rows, start=1):
        result.append(
            {
                "rank": rank,
                "user_id": user.id,
                "name": user.name or user.username or user.fbo_id,
                "fbo_id": user.fbo_id,
                "level": _calculate_level(user.xp_total or 0),
                "level_label": _calculate_level(user.xp_total or 0).title(),
                "xp_total": user.xp_total or 0,
            }
        )
    return result
