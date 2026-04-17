"""XP endpoints — leaderboard, personal summary, daily ping, monthly reset."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.services.xp_service import (
    DAILY_CAP,
    admin_force_reset_all,
    get_leaderboard,
    get_user_xp_history,
    get_user_xp_summary,
    grant_xp,
)

router = APIRouter()

LEVEL_LABELS = {
    "rookie": "Rookie",
    "agent": "Agent",
    "pro": "Pro",
    "elite": "Elite",
    "legend": "Legend",
}


@router.get("/me")
async def get_my_xp(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    summary = await get_user_xp_summary(session, user.user_id)
    if not summary:
        raise HTTPException(status_code=404, detail="User not found")
    await session.commit()

    level = summary["level"]
    return {
        "xp_total": summary["xp_total"],
        "level": level,
        "level_label": LEVEL_LABELS.get(level, level.title()),
        "daily_xp": summary["daily_xp"],
        "daily_cap": DAILY_CAP,
        "streak": summary["streak"],
        "next_level_xp": summary["next_level_xp"],
        "progress_pct": summary["progress_pct"],
        "season_year": summary.get("season_year"),
        "season_month": summary.get("season_month"),
    }


@router.get("/me/history")
async def get_my_xp_history(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> List[dict]:
    """Past monthly XP archive for the logged-in user."""
    return await get_user_xp_history(session, user.user_id)


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


@router.post("/admin/reset-month")
async def admin_reset_month(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin-only: archive current XP for all users and reset to 0.

    Normally this happens automatically on the 1st of each month when
    users first interact with the app.  Use this endpoint to force-reset
    early (e.g. for testing or emergency resets).
    """
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    count = await admin_force_reset_all(session)
    await session.commit()
    return {"reset_count": count, "message": f"Reset XP for {count} users. Season archived."}
