"""Current CC daily tracking sheet — member fills own, leader/admin fill downline."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.current_cc import (
    CcCompareResponse,
    CurrentCcAuto,
    CurrentCcOverviewResponse,
    CurrentCcSheetPublic,
    CurrentCcSheetUpsert,
    CurrentCcTrendResponse,
    TeamMemberOption,
)
from app.services.current_cc import (
    get_compare,
    get_overview,
    get_sheet,
    get_trends,
    list_team_members,
    today_ist,
    upsert_sheet,
)
from app.services.current_cc_auto import get_auto

router = APIRouter()


def _require_actor(user: AuthUser) -> None:
    if user.role not in ("team", "leader", "admin"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Current CC is only for team, leader, or admin accounts.",
        )


@router.get("/sheet", response_model=Optional[CurrentCcSheetPublic])
async def read_sheet(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    subject_user_id: int = Query(..., description="Team member the sheet is about"),
    sheet_date: date | None = Query(default=None, alias="date"),
) -> Optional[CurrentCcSheetPublic]:
    _require_actor(user)
    resolved = sheet_date or today_ist()
    try:
        return await get_sheet(
            session, actor=user, subject_user_id=subject_user_id, sheet_date=resolved
        )
    except PermissionError as exc:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/mine", response_model=Optional[CurrentCcSheetPublic])
async def read_my_sheet(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    sheet_date: date | None = Query(default=None, alias="date"),
) -> Optional[CurrentCcSheetPublic]:
    _require_actor(user)
    resolved = sheet_date or today_ist()
    return await get_sheet(
        session, actor=user, subject_user_id=user.user_id, sheet_date=resolved
    )


@router.put("/sheet", response_model=CurrentCcSheetPublic)
async def save_sheet(
    payload: CurrentCcSheetUpsert,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentCcSheetPublic:
    _require_actor(user)
    try:
        return await upsert_sheet(session, actor=user, payload=payload)
    except PermissionError as exc:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.get("/auto", response_model=CurrentCcAuto)
async def read_auto(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    subject_user_id: int = Query(..., description="Team member the report is about"),
    sheet_date: date | None = Query(default=None, alias="date"),
) -> CurrentCcAuto:
    """System-computed Tracking Report — used to prefill the form and compare."""
    _require_actor(user)
    try:
        return await get_auto(
            session, actor=user, subject_user_id=subject_user_id, day=sheet_date or today_ist()
        )
    except PermissionError as exc:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/overview", response_model=CurrentCcOverviewResponse)
async def read_overview(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    sheet_date: date | None = Query(default=None, alias="date"),
) -> CurrentCcOverviewResponse:
    """Team board — leader/admin only (members have no one below to oversee)."""
    if user.role not in ("leader", "admin"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Overview is for leader or admin accounts.",
        )
    return await get_overview(session, actor=user, day=sheet_date or today_ist())


@router.get("/team-members", response_model=list[TeamMemberOption])
async def read_team_members(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamMemberOption]:
    _require_actor(user)
    return await list_team_members(session, actor=user)


@router.get("/compare", response_model=CcCompareResponse)
async def read_compare(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    subject_user_id: int = Query(...),
) -> CcCompareResponse:
    _require_actor(user)
    try:
        return await get_compare(session, actor=user, subject_user_id=subject_user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/trends", response_model=CurrentCcTrendResponse)
async def read_trends(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    subject_user_id: int = Query(...),
    days: int = Query(default=30, ge=1, le=90),
) -> CurrentCcTrendResponse:
    _require_actor(user)
    try:
        return await get_trends(
            session, actor=user, subject_user_id=subject_user_id, days=days
        )
    except PermissionError as exc:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
