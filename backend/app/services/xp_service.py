"""Anti-cheat XP service for Myle Community."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent

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
PER_LEAD_ACTIONS = {"lead_contacted", "followup_completed"}

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


def _calculate_level(xp_total: int) -> str:
    for threshold, label in LEVEL_THRESHOLDS:
        if xp_total >= threshold:
            return label
    return "rookie"


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


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

    # Load user
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None

    # Admin excluded
    if user.role == "admin":
        return None

    # lead_won anti-cheat: lead must be >24h old
    if action == "lead_won":
        if lead_id is None:
            return None
        lead = (await session.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
        if lead is None:
            return None
        age = datetime.now(timezone.utc) - lead.created_at.replace(tzinfo=timezone.utc)
        if age < timedelta(hours=24):
            return None

    # Per-lead per-day cap for certain actions
    if action in PER_LEAD_ACTIONS and lead_id is not None:
        if await _already_granted_today(session, user_id, action, lead_id):
            return None

    # Daily cap check
    daily_xp = await _today_xp(session, user_id)
    if daily_xp >= DAILY_CAP:
        return None

    # Cap the actual grant so we don't exceed DAILY_CAP
    actual_xp = min(xp_amount, DAILY_CAP - daily_xp)

    # Write XP event
    event = XpEvent(user_id=user_id, action=action, xp=actual_xp, lead_id=lead_id)
    session.add(event)

    # Update user totals
    user.xp_total = (user.xp_total or 0) + actual_xp
    user.xp_level = _calculate_level(user.xp_total)

    await session.flush()
    return actual_xp


async def revoke_won_xp(session: AsyncSession, user_id: int, lead_id: int) -> None:
    """Delete lead_won XP events for a lead and deduct from user total."""
    # Find all lead_won events for this lead/user
    rows = (
        await session.execute(
            select(XpEvent).where(
                XpEvent.user_id == user_id,
                XpEvent.action == "lead_won",
                XpEvent.lead_id == lead_id,
            )
        )
    ).scalars().all()

    if not rows:
        return

    total_revoke = sum(e.xp for e in rows)

    await session.execute(
        delete(XpEvent).where(
            XpEvent.user_id == user_id,
            XpEvent.action == "lead_won",
            XpEvent.lead_id == lead_id,
        )
    )

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is not None:
        user.xp_total = max(0, (user.xp_total or 0) - total_revoke)
        user.xp_level = _calculate_level(user.xp_total)

    await session.flush()


async def get_user_xp_summary(session: AsyncSession, user_id: int) -> dict:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return {}

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
        "streak": user.login_streak or 0,
        "next_level_xp": next_xp,
        "progress_pct": progress_pct,
    }


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
                "name": user.username or user.fbo_id,
                "fbo_id": user.fbo_id,
                "level": _calculate_level(user.xp_total or 0),
                "xp_total": user.xp_total or 0,
            }
        )
    return result
