"""Analytics — activity from live leads; funnel report by status."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.system_surface import SystemStubResponse
from app.services.shell_insights import (
    build_activity_log_snapshot,
    build_status_funnel_report,
)

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/activity-log", response_model=SystemStubResponse)
async def analytics_activity_log(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Admin — recent lead creations (scoped); replace with audit store when added."""
    _require_admin(user)
    return await build_activity_log_snapshot(session, user)


@router.get("/day-2-report", response_model=SystemStubResponse)
async def analytics_day_2_report(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Admin — funnel by lead status (scoped); extend when Day 2 test entities exist."""
    _require_admin(user)
    return await build_status_funnel_report(session, user)
