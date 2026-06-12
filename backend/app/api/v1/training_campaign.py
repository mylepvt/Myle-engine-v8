from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.training_campaign import (
    CampaignCreate,
    CampaignEnrollRequest,
    CampaignEnrollmentPublic,
    CampaignMetrics,
    CampaignPublic,
    CampaignVerifyRequest,
)
from app.services import training_campaign_service as svc

router = APIRouter()


# ── Admin: Campaign CRUD ──────────────────────────────────────────


@router.get("/admin/campaigns", response_model=list[CampaignPublic])
async def list_campaigns(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(default=True),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.list_campaigns(session, active_only=active_only)


@router.post("/admin/campaigns", response_model=CampaignPublic)
async def create_campaign(
    body: CampaignCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.create_campaign(session, body, user.user_id)


@router.get("/admin/campaigns/{campaign_id}", response_model=CampaignPublic)
async def get_campaign(
    campaign_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    c = await svc.get_campaign(session, campaign_id)
    if c is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return c


# ── Enrollment ─────────────────────────────────────────────────────


@router.post("/admin/campaigns/{campaign_id}/enroll")
async def enroll_members(
    campaign_id: int,
    body: CampaignEnrollRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    added = await svc.enroll_members(session, campaign_id, body.user_ids)
    return {"ok": True, "enrolled": added}


@router.get(
    "/admin/campaigns/{campaign_id}/enrollments",
    response_model=list[CampaignEnrollmentPublic],
)
async def get_enrollments(
    campaign_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.get_enrollments(session, campaign_id)


# ── Metrics ────────────────────────────────────────────────────────


@router.get(
    "/admin/campaigns/{campaign_id}/metrics",
    response_model=CampaignMetrics,
)
async def campaign_metrics(
    campaign_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.get_campaign_metrics(session, campaign_id)


# ── Verification (leader/admin) ────────────────────────────────────


@router.post("/campaigns/verify")
async def verify_progress(
    body: CampaignVerifyRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leader or admin only")
    result = await svc.verify_progress(session, body, user.user_id)
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Progress entry not found")
    return result


# ── Member: my campaigns ───────────────────────────────────────────


@router.get(
    "/campaigns/my",
    response_model=list[CampaignEnrollmentPublic],
)
async def my_campaigns(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    campaign_id: Optional[int] = Query(default=None),
):
    return await svc.get_member_campaigns(session, user.user_id, campaign_id=campaign_id)


@router.post("/campaigns/submit")
async def submit_progress(
    body: dict,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    enrollment_id = body.get("enrollment_id")
    campaign_mission_id = body.get("campaign_mission_id")
    achieved = body.get("achieved", 0)
    evidence = body.get("evidence")

    if not enrollment_id or not campaign_mission_id:
        raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="enrollment_id and campaign_mission_id required")

    result = await svc.submit_progress(
        session, enrollment_id, campaign_mission_id, achieved, evidence
    )
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Progress entry not found")
    return result
