"""Team directory and enrollment stubs (org hierarchy phased)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, delete as sa_delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.auth_cookies import display_name_from_user
from app.core.realtime_hub import notify_topics
from app.core.fbo_id import normalize_fbo_id
from app.core.passwords import hash_password
from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User
from app.schemas.system_surface import SystemStubResponse
from app.schemas.team import (
    EnrollmentDecisionBody,
    PendingRegistrationsResponse,
    PendingRegistrationItem,
    RegistrationDecisionBody,
    TeamEnrollmentHistoryResponse,
    TeamEnrollmentListResponse,
    TeamMemberComplianceUpdate,
    TeamMemberCreate,
    TeamMemberListResponse,
    TeamMemberPublic,
    TeamMyTeamResponse,
    TeamReportItem,
    TeamReportMissingMember,
    TeamReportsLiveSummary,
    TeamReportsResponse,
)
from app.services.downline import is_user_in_downline_of
from app.services.lead_owner import lead_owner_clause
from app.services.member_compliance import build_compliance_snapshots
from app.services.payment_service import PaymentService
from app.services.team_reports_metrics import IST, compute_live_summary
from app.services.user_hierarchy import (
    load_user_hierarchy_entries,
    nearest_leader_entry,
    recursive_downline_user_ids,
)

router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin_or_leader(user: AuthUser) -> None:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _attach_team_member_hierarchy(
    session: AsyncSession,
    items: list[TeamMemberPublic],
) -> list[TeamMemberPublic]:
    entries = await load_user_hierarchy_entries(session, [item.id for item in items])
    for item in items:
        leader = nearest_leader_entry(item.id, entries)
        item.leader_user_id = leader.id if leader is not None else None
        item.leader_name = leader.display_name if leader is not None else None
    return items


async def _attach_team_member_compliance(
    session: AsyncSession,
    items: list[TeamMemberPublic],
) -> list[TeamMemberPublic]:
    snapshots = await build_compliance_snapshots(
        session,
        [item.id for item in items],
        apply_actions=True,
    )
    for item in items:
        snapshot = snapshots.get(item.id)
        if snapshot is None:
            continue
        item.access_blocked = snapshot.access_blocked
        item.discipline_status = snapshot.discipline_status
        item.grace_end_date = snapshot.grace_end_date
        item.grace_reason = snapshot.grace_reason
        item.removed_at = snapshot.removed_at
        item.removal_reason = snapshot.removal_reason
        item.calls_short_streak = snapshot.calls_short_streak
        item.missing_report_streak = snapshot.missing_report_streak
        item.compliance_level = snapshot.compliance_level
        item.compliance_title = snapshot.compliance_title
        item.compliance_summary = snapshot.compliance_summary
        item.grace_active = snapshot.grace_active
        item.grace_ending_tomorrow = snapshot.grace_ending_tomorrow
    return items


async def _finalize_team_member_items(
    session: AsyncSession,
    items: list[TeamMemberPublic],
) -> list[TeamMemberPublic]:
    items = await _attach_team_member_hierarchy(session, items)
    items = await _attach_team_member_compliance(session, items)
    return items


def _display_name_or_fbo(member: User) -> str:
    return display_name_from_user(member) or member.fbo_id


def _upline_label(upline: User | None) -> str | None:
    if upline is None:
        return None
    return _display_name_or_fbo(upline)


async def _team_reports_scope_members(
    session: AsyncSession,
    user: AuthUser,
) -> list[TeamReportMissingMember]:
    Upline = aliased(User, name="upline")

    where_parts = [User.registration_status == "approved"]
    if user.role == "admin":
        where_parts.append(User.role.in_(("leader", "team")))
    else:
        downline_ids = await recursive_downline_user_ids(session, user.user_id)
        if not downline_ids:
            return []
        where_parts.append(User.id.in_(downline_ids))

    rows = (
        await session.execute(
            select(User, Upline)
            .outerjoin(Upline, User.upline_user_id == Upline.id)
            .where(*where_parts)
            .order_by(User.created_at.asc(), User.id.asc())
        )
    ).all()

    return [
        TeamReportMissingMember(
            user_id=member.id,
            member_name=_display_name_or_fbo(member),
            member_username=(member.username or "").strip() or None,
            member_email=member.email,
            member_phone=member.phone,
            member_fbo_id=member.fbo_id,
            member_role=member.role,
            upline_name=_upline_label(upline),
            upline_fbo_id=upline.fbo_id if upline is not None else None,
        )
        for member, upline in rows
    ]


@router.get("/members", response_model=TeamMemberListResponse)
async def list_team_members(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> TeamMemberListResponse:
    """All users (no passwords) — admin only."""
    _require_admin(user)

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
    items = await _attach_team_member_hierarchy(session, items)
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
    [item] = await _finalize_team_member_items(session, [TeamMemberPublic.model_validate(row)])
    return item


@router.get("/my-team", response_model=TeamMyTeamResponse)
async def my_team(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMyTeamResponse:
    """Leader: self + entire downline (flat). Team: self only. Admin: global directory slice (UI preview / QA)."""
    if user.role not in ("admin", "leader", "team"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

    Upline = aliased(User, name="upline")

    if user.role == "admin":
        count_q = select(func.count()).select_from(User)
        total = int((await session.execute(count_q)).scalar_one())
        list_q = (
            select(User, Upline.fbo_id.label("upline_fbo_id"), Upline.username.label("upline_username"))
            .outerjoin(Upline, User.upline_user_id == Upline.id)
            .order_by(User.created_at.asc())
            .limit(_MAX_LIMIT)
            .offset(0)
        )
        rows = (await session.execute(list_q)).all()
        items: list[TeamMemberPublic] = []
        for row in rows:
            u, up_fbo, up_name = row
            item = TeamMemberPublic.model_validate(u)
            item.upline_fbo_id = up_fbo
            item.upline_name = up_name
            items.append(item)
        items = await _finalize_team_member_items(session, items)
        return TeamMyTeamResponse(
            items=items,
            total=total,
            direct_members=0,
            total_downline=0,
        )

    if user.role == "team":
        row = await session.get(User, user.user_id)
        if row is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
        item = TeamMemberPublic.model_validate(row)
        if row.upline_user_id is not None:
            up = await session.get(User, row.upline_user_id)
            if up is not None:
                item.upline_fbo_id = up.fbo_id
                item.upline_name = (up.username or up.name or up.fbo_id or "").strip() or None
        [item] = await _finalize_team_member_items(session, [item])
        return TeamMyTeamResponse(items=[item], total=1, direct_members=0, total_downline=0)

    leader_id = user.user_id
    downline_ids = await recursive_downline_user_ids(session, leader_id)
    id_list = [leader_id, *downline_ids]
    list_q = (
        select(User, Upline.fbo_id.label("upline_fbo_id"), Upline.username.label("upline_username"))
        .outerjoin(Upline, User.upline_user_id == Upline.id)
        .where(User.id.in_(id_list))
        .order_by(case((User.id == leader_id, 0), else_=1), User.created_at.asc())
    )
    rows = (await session.execute(list_q)).all()
    items: list[TeamMemberPublic] = []
    for row in rows:
        u, up_fbo, up_name = row
        item = TeamMemberPublic.model_validate(u)
        item.upline_fbo_id = up_fbo
        item.upline_name = up_name
        items.append(item)
    items = await _finalize_team_member_items(session, items)

    direct_ct = int(
        (
            await session.execute(
                select(func.count()).select_from(User).where(User.upline_user_id == leader_id)
            )
        ).scalar_one()
    )
    return TeamMyTeamResponse(
        items=items,
        total=len(items),
        direct_members=direct_ct,
        total_downline=len(downline_ids),
    )


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


@router.get("/enrollment-requests/history", response_model=TeamEnrollmentHistoryResponse)
async def enrollment_request_history(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    date: Optional[str] = Query(
        default=None,
        description="Calendar day YYYY-MM-DD (Asia/Kolkata); default today",
    ),
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> TeamEnrollmentHistoryResponse:
    """Calendar-wise proof approval / rejection history for admin / leader review."""
    _require_admin_or_leader(user)
    target_day = _parse_report_date_param(date)
    start_ist = datetime.combine(target_day, time.min, tzinfo=IST)
    end_ist = start_ist + timedelta(days=1)
    service = PaymentService(session)
    items, total = await service.get_payment_proof_history(
        user.user_id,
        user.role,
        reviewed_after=start_ist.astimezone(timezone.utc),
        reviewed_before=end_ist.astimezone(timezone.utc),
        limit=limit,
        offset=offset,
    )
    return TeamEnrollmentHistoryResponse(items=items, total=total, date=target_day.isoformat())


@router.post("/enrollment-requests/{lead_id}/decision")
async def decide_enrollment_request(
    lead_id: int,
    body: EnrollmentDecisionBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Only admin can approve/reject — leader can view queue but not act on it.
    _require_admin(user)
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
    """Leader/admin team reports with org-tree scoping and member-wise daily rows."""
    _require_admin_or_leader(user)
    d = _parse_report_date_param(date)

    scope_members = await _team_reports_scope_members(session, user)
    scope_user_ids = [member.user_id for member in scope_members]
    live = await compute_live_summary(session, d, user_ids=scope_user_ids)

    items: list[TeamReportItem] = []
    submitted_ids: set[int] = set()
    if scope_user_ids:
        ReportMember = aliased(User, name="report_member")
        ReportUpline = aliased(User, name="report_upline")
        rows = (
            await session.execute(
                select(DailyReport, ReportMember, ReportUpline)
                .join(ReportMember, ReportMember.id == DailyReport.user_id)
                .outerjoin(ReportUpline, ReportMember.upline_user_id == ReportUpline.id)
                .where(
                    DailyReport.user_id.in_(scope_user_ids),
                    DailyReport.report_date == d,
                )
                .order_by(DailyReport.submitted_at.desc(), ReportMember.created_at.asc(), ReportMember.id.asc())
            )
        ).all()

        for report, member, upline in rows:
            submitted_ids.add(int(member.id))
            items.append(
                TeamReportItem(
                    report_id=report.id,
                    report_date=report.report_date,
                    submitted_at=report.submitted_at,
                    user_id=member.id,
                    member_name=_display_name_or_fbo(member),
                    member_username=(member.username or "").strip() or None,
                    member_email=member.email,
                    member_phone=member.phone,
                    member_fbo_id=member.fbo_id,
                    member_role=member.role,
                    upline_name=_upline_label(upline),
                    upline_fbo_id=upline.fbo_id if upline is not None else None,
                    total_calling=int(report.total_calling or 0),
                    calls_picked=int(report.calls_picked or 0),
                    wrong_numbers=int(report.wrong_numbers or 0),
                    enrollments_done=int(report.enrollments_done or 0),
                    pending_enroll=int(report.pending_enroll or 0),
                    underage=int(report.underage or 0),
                    plan_2cc=int(report.plan_2cc or 0),
                    seat_holdings=int(report.seat_holdings or 0),
                    leads_educated=int(report.leads_educated or 0),
                    pdf_covered=int(report.pdf_covered or 0),
                    videos_sent_actual=int(report.videos_sent_actual or 0),
                    calls_made_actual=int(report.calls_made_actual or 0),
                    payments_actual=int(report.payments_actual or 0),
                    remarks=report.remarks,
                    system_verified=bool(report.system_verified),
                )
            )

    missing_members = [
        member for member in scope_members if member.user_id not in submitted_ids
    ]

    scope_note = (
        "Leader view is scoped to your org-tree downline and excludes your own report."
        if user.role == "leader"
        else "Admin view includes all approved leader and team members across the org tree."
    )
    return TeamReportsResponse(
        items=items,
        total=len(items),
        missing_members=missing_members,
        scope_total_members=len(scope_members),
        date=d.isoformat(),
        live_summary=TeamReportsLiveSummary(**live),
        note=(
            f"{scope_note} "
            "Tiles use pool claims (activity_log), call events, payment proof upload timestamps, "
            "payment proof approvals, and active pipeline counts for the same scoped members. "
            "Daily report rows are read-only and ordered by latest submission time."
        ),
    )


@router.get("/pending-registrations", response_model=PendingRegistrationsResponse)
async def list_pending_registrations(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PendingRegistrationsResponse:
    """Admin — self-serve signups awaiting approval (legacy ``/admin/approvals``)."""
    _require_admin(user)
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
    """Reset a user's password. Admin: any user. Leader: strict downline only (not self)."""
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
    if user.role == "leader":
        if target_user_id == user.user_id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Leaders cannot reset their own password via this endpoint",
            )
        if not await is_user_in_downline_of(session, target_user_id, user.user_id):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
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
    """Leads permanently owned by a specific user. Admin only."""
    _require_admin(user)
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    count_q = (
        select(func.count())
        .select_from(Lead)
        .where(lead_owner_clause(target_user_id))
        .where(Lead.deleted_at.is_(None))
    )
    total = int((await session.execute(count_q)).scalar_one())
    list_q = (
        select(Lead)
        .where(lead_owner_clause(target_user_id))
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
    previous_role = (target.role or "").strip().lower()
    target.role = body.role
    if body.role in ("leader", "team") and previous_role != body.role:
        target.discipline_reset_on = datetime.now(IST).date()
        if previous_role == "admin":
            target.access_blocked = False
            target.discipline_status = "active"
            target.removed_at = None
            target.removed_by_user_id = None
            target.removal_reason = None
    await session.commit()
    await session.refresh(target)
    [item] = await _finalize_team_member_items(session, [TeamMemberPublic.model_validate(target)])
    return item


@router.patch("/members/{target_user_id}/compliance", response_model=TeamMemberPublic)
async def update_member_compliance(
    target_user_id: int,
    body: TeamMemberComplianceUpdate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberPublic:
    """Admin control center for grace / restore / manual removal."""
    _require_admin(user)
    target = await session.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.action == "remove_now" and target.id == user.user_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own account",
        )

    role_key = (target.role or "").strip().lower()
    if body.action == "grant_grace":
        if role_key not in {"team", "leader"}:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Grace is only available for leader or team accounts",
            )
        if body.grace_end_date is None:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="grace_end_date is required",
            )
        today = datetime.now(IST).date()
        if body.grace_end_date < today:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="grace_end_date cannot be in the past",
            )
        target.access_blocked = False
        target.discipline_status = "grace"
        target.grace_end_date = body.grace_end_date
        target.grace_reason = (body.reason or "").strip() or None
        target.grace_updated_at = datetime.now(timezone.utc)
        target.grace_set_by_user_id = user.user_id
        target.discipline_reset_on = None
        target.removed_at = None
        target.removed_by_user_id = None
        target.removal_reason = None
    elif body.action == "clear_grace":
        target.access_blocked = False
        target.discipline_status = "active"
        target.grace_end_date = None
        target.grace_reason = None
        target.grace_updated_at = datetime.now(timezone.utc)
        target.grace_set_by_user_id = user.user_id
        target.discipline_reset_on = datetime.now(IST).date()
    elif body.action == "restore_access":
        target.access_blocked = False
        target.discipline_status = "active"
        target.grace_end_date = None
        target.grace_reason = None
        target.grace_updated_at = None
        target.grace_set_by_user_id = None
        target.removed_at = None
        target.removed_by_user_id = None
        target.removal_reason = None
        target.discipline_reset_on = datetime.now(IST).date()
    elif body.action == "remove_now":
        target.access_blocked = True
        target.discipline_status = "removed"
        target.removed_at = datetime.now(timezone.utc)
        target.removed_by_user_id = user.user_id
        target.removal_reason = (body.reason or "").strip() or "Removed manually by admin."
        target.grace_end_date = None
        target.grace_reason = None
        target.grace_updated_at = None
        target.grace_set_by_user_id = None
    else:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported compliance action",
        )

    await session.commit()
    await session.refresh(target)
    item = TeamMemberPublic.model_validate(target)
    if target.upline_user_id is not None:
        up = await session.get(User, target.upline_user_id)
        if up is not None:
            item.upline_fbo_id = up.fbo_id
            item.upline_name = (up.username or up.name or up.fbo_id or "").strip() or None
    [item] = await _finalize_team_member_items(session, [item])
    await notify_topics("team", "team_tracking")
    return item


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
