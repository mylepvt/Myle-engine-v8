"""XP endpoints — leaderboard, personal summary, daily ping."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.services.xp_service import (
    DAILY_CAP,
    NEXT_LEVEL_XP,
    _calculate_level,
    get_leaderboard,
    get_user_xp_summary,
    grant_xp,
)

router = APIRouter()


@router.get("/me")
async def get_my_xp(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    summary = await get_user_xp_summary(session, user.user_id)
    if not summary:
        raise HTTPException(status_code=404, detail="User not found")

    level = summary["level"]
    level_labels = {
        "rookie": "Rookie",
        "agent": "Agent",
        "pro": "Pro",
        "elite": "Elite",
        "legend": "Legend",
    }

    return {
        "xp_total": summary["xp_total"],
        "level": level,
        "level_label": level_labels.get(level, level.title()),
        "daily_xp": summary["daily_xp"],
        "daily_cap": DAILY_CAP,
        "streak": summary["streak"],
        "next_level_xp": summary["next_level_xp"],
        "progress_pct": summary["progress_pct"],
    }


@router.get("/leaderboard")
async def leaderboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> List[dict]:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return await get_leaderboard(session, limit=10)


@router.post("/ping-login")
async def ping_login(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Idempotent daily login XP grant. Also updates login_streak."""
    db_user = (await session.execute(select(User).where(User.id == user.user_id))).scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    today = datetime.now(timezone.utc).date()
    already_today = db_user.last_login_date == today

    xp_granted = None
    if not already_today:
        # Update streak
        yesterday = date.fromordinal(today.toordinal() - 1)
        if db_user.last_login_date == yesterday:
            db_user.login_streak = (db_user.login_streak or 0) + 1
        else:
            db_user.login_streak = 1
        db_user.last_login_date = today
        await session.flush()

        xp_granted = await grant_xp(session, user.user_id, "login_daily")
        await session.commit()

    return {
        "xp_granted": xp_granted,
        "already_claimed": already_today,
        "streak": db_user.login_streak or 0,
    }
