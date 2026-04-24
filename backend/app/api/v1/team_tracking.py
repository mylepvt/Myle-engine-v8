from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.team_tracking import TeamTrackingDetailResponse, TeamTrackingOverviewResponse
from app.services.team_tracking import get_tracking_detail, get_tracking_overview, today_ist

router = APIRouter()


def _resolve_stat_date(raw: date | None) -> date:
    return raw or today_ist()


@router.get("/tracking/overview", response_model=TeamTrackingOverviewResponse)
async def team_tracking_overview(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stat_date: date | None = Query(default=None, alias="date"),
) -> TeamTrackingOverviewResponse:
    resolved = _resolve_stat_date(stat_date)
    return await get_tracking_overview(session, actor=user, stat_date=resolved)


@router.get("/tracking/me", response_model=TeamTrackingDetailResponse)
async def team_tracking_me(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stat_date: date | None = Query(default=None, alias="date"),
) -> TeamTrackingDetailResponse:
    resolved = _resolve_stat_date(stat_date)
    return await get_tracking_detail(
        session,
        actor=user,
        target_user_id=user.user_id,
        stat_date=resolved,
    )


@router.get("/tracking/{target_user_id}", response_model=TeamTrackingDetailResponse)
async def team_tracking_detail(
    target_user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stat_date: date | None = Query(default=None, alias="date"),
) -> TeamTrackingDetailResponse:
    resolved = _resolve_stat_date(stat_date)
    try:
        return await get_tracking_detail(
            session,
            actor=user,
            target_user_id=target_user_id,
            stat_date=resolved,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
