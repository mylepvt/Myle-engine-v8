from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.missions import (
    AdminMissionSummary,
    DailyMissionPublic,
    MissionBlockerPublic,
    MissionBlockerRequest,
    MissionTemplateCreate,
    MissionTemplatePublic,
    MissionTickRequest,
)
from app.services import mission_service as svc

router = APIRouter()


# ── Template (Admin) ──────────────────────────────────────────────


@router.get("/admin/mission-templates", response_model=list[MissionTemplatePublic])
async def list_templates(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(default=True),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.list_templates(session, active_only=active_only)


@router.post("/admin/mission-templates", response_model=MissionTemplatePublic)
async def create_template(
    body: MissionTemplateCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.create_template(session, body, user.user_id)


# ── Member missions ────────────────────────────────────────────────


@router.get("/missions/today", response_model=DailyMissionPublic)
async def get_today_mission(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    mission = await svc.get_or_create_today_mission(session, user.user_id, user.role)
    return mission


@router.post("/missions/today/tick", response_model=DailyMissionPublic)
async def tick_mission(
    body: MissionTickRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    mission = await svc.get_or_create_today_mission(session, user.user_id, user.role)
    return await svc.tick_mission_item(session, mission, body)


@router.post("/missions/today/complete", response_model=DailyMissionPublic)
async def complete_mission(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    mission = await svc.get_or_create_today_mission(session, user.user_id, user.role)
    return await svc.complete_mission(session, mission)


@router.post("/missions/today/blocker", response_model=dict)
async def report_blocker(
    body: MissionBlockerRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    mission = await svc.get_or_create_today_mission(session, user.user_id, user.role)
    blocker = await svc.create_blocker(session, mission, body.reason, body.notes)
    return {"ok": True, "blocker_id": blocker.id, "reason": blocker.reason}


@router.get("/missions/history", response_model=list[DailyMissionPublic])
async def mission_history(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=30, ge=1, le=90),
):
    return await svc.get_member_mission_history(session, user.user_id, limit=limit)


# ── Leader view ────────────────────────────────────────────────────


@router.get("/leader/team-missions")
async def leader_team_missions(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leader or admin only")
    return {"team": await svc.get_team_today_missions(session, user.user_id)}


# ── Admin summary ──────────────────────────────────────────────────


@router.get("/admin/missions/summary", response_model=AdminMissionSummary)
async def admin_mission_summary(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    mission_date: Optional[date] = Query(default=None),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.get_admin_summary(session, mission_date=mission_date)


@router.get("/admin/missions/leader/{leader_id}")
async def admin_leader_team_missions(
    leader_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return {"team": await svc.get_team_today_missions(session, leader_id)}
