"""Team directory and enrollment stubs (org hierarchy phased)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.core.fbo_id import normalize_fbo_id
from app.core.passwords import hash_password
from app.models.lead import Lead
from app.models.user import User
from app.schemas.system_surface import SystemStubResponse
from app.schemas.team import (
    EnrollmentDecisionBody,
    PendingRegistrationsResponse,
    PendingRegistrationItem,
    RegistrationDecisionBody,
    TeamEnrollmentListResponse,
    TeamMemberCreate,
    TeamMemberListResponse,
    TeamMemberPublic,
    TeamMyTeamResponse,
    TeamReportsLiveSummary,
    TeamReportsResponse,
)
from app.services.payment_service import PaymentService
from app.services.team_reports_metrics import IST, compute_live_summary

router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_leader(user: AuthUser) -> None:
    if user.role != "leader":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin_or_leader(user: AuthUser) -> None:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/members", response_model=TeamMemberListResponse)
async def list_team_members(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> TeamMemberListResponse:
    """All users (no passwords) — admin only."""
    _require_admin(user)

    from sqlalchemy.orm import aliased
    count_q = select(func.count()).select_from(User)
    total = int((await session.execute(count_q)).scalar_one())

    Upline = aliased(User, name="upline")
    list_q = (
        select(User, Upline.fbo_id.label("upline_fbo_id"), Upline.username.label("upline_username"))
        .outerjoin(Upline, User.upline_user_id == Upline.id)
        .order_by(User.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(list_q)).all()
    items = []
    for row in rows:
        u, up_fbo, up_name = row
        item = TeamMemberPublic.model_validate(u)
        item.upline_fbo_id = up_fbo
        item.upline_name = up_name
        items.append(item)
    return TeamMemberListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/members",
    response_model=TeamMemberPublic,
    status_code=http_status.HTTP_201_CREATED,
)
async def create_team_member(
    body: TeamMemberCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberPublic:
    """Create a user (password login). Admin only — complements ``scripts/create_user.py`` for HTTP flows."""
    _require_admin(user)
    fbo_n = normalize_fbo_id(body.fbo_id)
    dup_fbo = await session.execute(select(User.id).where(User.fbo_id == fbo_n))
    if dup_fbo.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="FBO ID already registered",
        )
    email_n = body.email.strip().lower()
    dup = await session.execute(select(User.id).where(User.email == email_n))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    un = body.username.strip() if body.username and body.username.strip() else None
    row = User(
        fbo_id=fbo_n,
        username=un,
        email=email_n,
        role=body.role,
        hashed_password=hash_password(body.password),
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="FBO ID or email already registered",
        ) from None
    await session.refresh(row)
    return TeamMemberPublic.model_validate(row)


@router.get("/my-team", response_model=TeamMyTeamResponse)
async def my_team(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMyTeamResponse:
    """Leader-only; V1 returns only your own row until reporting lines are modeled."""
    _require_leader(user)

    row = await session.get(User, user.user_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    return TeamMyTeamResponse(items=[TeamMemberPublic.model_validate(row)], total=1)


@router.get("/enrollment-requests", response_model=TeamEnrollmentListResponse)
async def list_enrollment_requests(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> TeamEnrollmentListResponse:
    """₹196 proof approval queue for admin/leader review."""
    _require_admin_or_leader(user)
    service = PaymentService(session)
    items = await service.get_pending_payment_proofs(user.user_id, user.role)
    total = len(items)
    page = items[offset : offset + limit]
    return TeamEnrollmentListResponse(items=page, total=total, limit=limit, offset=offset)


@router.post("/enrollment-requests/{lead_id}/decision")
async def decide_enrollment_request(
    lead_id: int,
    body: EnrollmentDecisionBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin_or_leader(user)
    service = PaymentService(session)
    if body.action == "approve":
        ok, message = await service.approve_payment_proof(
            lead_id=lead_id,
            approved_by_user_id=user.user_id,
            approved_by_role=user.role,
        )
        payment_status = "approved"
    else:
        ok, message = await service.reject_payment_proof(
            lead_id=lead_id,
            rejection_reason=(body.reason or "").strip() or "Rejected by reviewer",
            rejected_by_user_id=user.user_id,
            rejected_by_role=user.role,
        )
        payment_status = "rejected"
    if not ok:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=message)
    await notify_topics("team", "leads")
    return {"ok": True, "payment_status": payment_status, "message": message}


def _parse_report_date_param(raw: Optional[str]) -> date:
    if raw is None or not str(raw).strip():
        return datetime.now(IST).date()
    s = str(raw).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError as e:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid date; use YYYY-MM-DD",
        ) from e


@router.get("/reports", response_model=TeamReportsResponse)
async def team_reports(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    date: Optional[str] = Query(
        default=None,
        description="Calendar day YYYY-MM-DD (Asia/Kolkata); default today",
    ),
) -> TeamReportsResponse:
    """Admin — live pipeline metrics (legacy team reports top row)."""
    _require_admin(user)
    d = _parse_report_date_param(date)
    live = await compute_live_summary(session, d)
    return TeamReportsResponse(
        date=d.isoformat(),
        live_summary=TeamReportsLiveSummary(**live),
        note=(
            "Tiles use pool claims (activity_log), call events, payment proof upload timestamps, "
            "payment proof approvals (activity_log payment_proof_approved), and active pipeline counts. "
            "Per-user daily report lines also exist (POST /api/v1/reports/daily) and feed leaderboard scoring."
        ),
    )


@router.get("/pending-registrations", response_model=PendingRegistrationsResponse)
async def list_pending_registrations(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PendingRegistrationsResponse:
    """Admin — self-serve signups awaiting approval (legacy ``/admin/approvals``)."""
    _require_admin(user)
    UplineAlias = User.__class__.__mro__  # just for naming — use aliased below
    from sqlalchemy.orm import aliased
    Upline = aliased(User, name="upline")
    q = await session.execute(
        select(User, Upline.fbo_id.label("upline_fbo_id"), Upline.username.label("upline_username"))
        .outerjoin(Upline, User.upline_user_id == Upline.id)
        .where(User.registration_status == "pending")
        .order_by(User.created_at.asc())
    )
    rows = q.all()
    items = []
    for row in rows:
        u, up_fbo, up_name = row
        item = PendingRegistrationItem.model_validate(u)
        item.upline_fbo_id = up_fbo
        item.upline_name = up_name
        items.append(item)
    return PendingRegistrationsResponse(items=items, total=len(items))


@router.post("/pending-registrations/{target_user_id}/decision")
async def decide_pending_registration(
    target_user_id: int,
    body: RegistrationDecisionBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    row = await session.get(User, target_user_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    st = (row.registration_status or "").strip().lower()
    if st != "pending":
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="User is not pending approval",
        )
    if body.action == "approve":
        row.registration_status = "approved"
    else:
        row.registration_status = "rejected"
    await session.commit()
    return {"ok": True, "registration_status": row.registration_status}


@router.post("/members/{target_user_id}/reset-password")
async def reset_member_password(
    target_user_id: int,
    body: dict,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Reset a user's password. Admin/leader only."""
    _require_admin_or_leader(user)
    new_password = body.get("new_password", "")
    if not isinstance(new_password, str) or len(new_password) < 8:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="new_password must be at least 8 characters",
        )
    row = await session.get(User, target_user_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    row.hashed_password = hash_password(new_password)
    await session.commit()
    return {"ok": True}


@router.post("/members/reset-password-bulk")
async def reset_all_members_password(
    body: dict,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Reset password for all users. Admin only."""
    _require_admin(user)
    new_password = body.get("new_password", "")
    if not isinstance(new_password, str) or len(new_password) < 8:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="new_password must be at least 8 characters",
        )
    result = await session.execute(
        update(User).values(hashed_password=hash_password(new_password))
    )
    await session.commit()
    return {"ok": True, "updated": int(result.rowcount or 0)}


class MemberLeadSummary(BaseModel):
    id: int
    name: str
    status: str
    phone: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberLeadsResponse(BaseModel):
    items: List[MemberLeadSummary]
    total: int


class UpdateRoleBody(BaseModel):
    role: str


@router.get("/members/{target_user_id}/leads", response_model=MemberLeadsResponse)
async def get_member_leads(
    target_user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> MemberLeadsResponse:
    """Leads created by or assigned to a specific user. Admin only."""
    _require_admin(user)
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    count_q = (
        select(func.count())
        .select_from(Lead)
        .where(Lead.created_by_user_id == target_user_id)
        .where(Lead.deleted_at.is_(None))
    )
    total = int((await session.execute(count_q)).scalar_one())
    list_q = (
        select(Lead)
        .where(Lead.created_by_user_id == target_user_id)
        .where(Lead.deleted_at.is_(None))
        .order_by(Lead.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(list_q)).scalars().all()
    items = [MemberLeadSummary.model_validate(r) for r in rows]
    return MemberLeadsResponse(items=items, total=total)


@router.patch("/members/{target_user_id}/role")
async def update_member_role(
    target_user_id: int,
    body: UpdateRoleBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberPublic:
    """Change a user's role. Admin only."""
    _require_admin(user)
    if body.role not in ("admin", "leader", "team"):
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="role must be admin, leader, or team",
        )
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.id == user.user_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )
    target.role = body.role
    await session.commit()
    await session.refresh(target)
    return TeamMemberPublic.model_validate(target)


class TrainingToggleBody(BaseModel):
    locked: bool  # True = require training (lock), False = skip/unlock training


@router.patch("/members/{target_user_id}/training-lock")
async def toggle_training_lock(
    target_user_id: int,
    body: TrainingToggleBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: force-lock or force-unlock 7-day training for any user."""
    _require_admin(user)
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.locked:
        # Lock: require training, reset to pending unless already completed
        target.training_required = True
        if target.training_status == "not_required":
            target.training_status = "pending"
    else:
        # Unlock: skip training entirely
        target.training_required = False
        target.training_status = "not_required"
    await session.commit()
    return {
        "user_id": target.id,
        "fbo_id": target.fbo_id,
        "training_required": target.training_required,
        "training_status": target.training_status,
    }


@router.delete("/members/{target_user_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_member(
    target_user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a user account. Admin only. Cannot delete yourself."""
    _require_admin(user)
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.id == user.user_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    await session.delete(target)
    await session.commit()


@router.get("/approvals", response_model=SystemStubResponse)
async def team_approvals(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> SystemStubResponse:
    _require_admin(user)
    return SystemStubResponse(
        items=[
            {
                "title": "Pending registrations",
                "detail": "Use Team → Approvals for the full list (GET /api/v1/team/pending-registrations).",
                "href": "team/approvals",
            },
            {
                "title": "₹196 enrollment queue",
                "detail": "Enrollment proof + approvals: Team → ₹196 Approvals.",
                "href": "team/enrollment-approvals",
            },
        ],
        total=2,
        note="Registration approve/reject is on the Approvals page; this endpoint stays for shell parity.",
    )
