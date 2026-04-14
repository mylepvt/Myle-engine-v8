from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import AuthUser, require_auth_user
from app.schemas.workboard import (
    WorkboardLeadsResponse,
    WorkboardResponse,
    WorkboardStaleResponse,
    WorkboardSummaryResponse,
)
from app.services.workboard_service import WorkboardService, get_workboard_service

router = APIRouter()

_DEFAULT_PER_COLUMN = 40
_DEFAULT_MAX_ROWS = 300
_DEFAULT_STALE_HOURS = 24
_DEFAULT_STALE_LIMIT = 100


@router.get("", response_model=WorkboardResponse)
async def get_workboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[WorkboardService, Depends(get_workboard_service)],
    limit_per_column: int = Query(
        default=_DEFAULT_PER_COLUMN,
        ge=1,
        le=80,
        description="Max cards returned per status column",
    ),
    max_rows: int = Query(
        default=_DEFAULT_MAX_ROWS,
        ge=50,
        le=500,
        description="Recent leads loaded before bucketing (newest first)",
    ),
    stale_hours: int = Query(default=_DEFAULT_STALE_HOURS, ge=1, le=336),
) -> WorkboardResponse:
    return await service.get_legacy_workboard(
        user=user,
        limit_per_column=limit_per_column,
        max_rows=max_rows,
        stale_hours=stale_hours,
    )


@router.get("/summary", response_model=WorkboardSummaryResponse)
async def get_workboard_summary(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[WorkboardService, Depends(get_workboard_service)],
    stale_hours: int = Query(default=_DEFAULT_STALE_HOURS, ge=1, le=336),
) -> WorkboardSummaryResponse:
    return await service.get_summary(user=user, stale_hours=stale_hours)


@router.get("/leads", response_model=WorkboardLeadsResponse)
async def get_workboard_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[WorkboardService, Depends(get_workboard_service)],
    limit_per_column: int = Query(default=_DEFAULT_PER_COLUMN, ge=1, le=80),
    max_rows: int = Query(default=_DEFAULT_MAX_ROWS, ge=50, le=500),
) -> WorkboardLeadsResponse:
    return await service.get_leads(
        user=user,
        limit_per_column=limit_per_column,
        max_rows=max_rows,
    )


@router.get("/stale", response_model=WorkboardStaleResponse)
async def get_workboard_stale(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[WorkboardService, Depends(get_workboard_service)],
    stale_hours: int = Query(default=_DEFAULT_STALE_HOURS, ge=1, le=336),
    limit: int = Query(default=_DEFAULT_STALE_LIMIT, ge=1, le=500),
) -> WorkboardStaleResponse:
    return await service.get_stale(
        user=user,
        stale_hours=stale_hours,
        limit=limit,
    )
