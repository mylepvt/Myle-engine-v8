from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.task_assignment import TaskAssignment
from app.models.user import User
from app.models.verification_task import VerificationTask
from app.schemas.verification import (
    AdminVerificationSummary,
    TaskAssignmentBulkCreate,
    TaskAssignmentCreate,
    TaskAssignmentPublic,
    TaskBlocked,
    TaskEvidenceSubmit,
    TaskVerification,
    VerificationTaskCreate,
    VerificationTaskPublic,
)
from app.services import verification_service as svc

router = APIRouter()


@router.post("/admin/verification-tasks", response_model=VerificationTaskPublic)
async def create_verification_task(
    body: VerificationTaskCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.create_verification_task(session, body, user)


@router.get("/admin/verification-tasks", response_model=list[VerificationTaskPublic])
async def list_verification_tasks(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(default=True),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.list_verification_tasks(session, active_only=active_only)


@router.post("/admin/task-assign", response_model=list[TaskAssignmentPublic])
async def assign_task_bulk(
    body: TaskAssignmentBulkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    assignments = await svc.bulk_assign_task(session, body, user)
    return [await _serialize_assignment(session, a) for a in assignments]


@router.post("/admin/task-assign/single", response_model=TaskAssignmentPublic)
async def assign_task_single(
    body: TaskAssignmentCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin or leader only")
    assignment = await svc.assign_task(session, body, user)
    return await _serialize_assignment(session, assignment)


@router.post("/admin/tasks/{assignment_id}/verify", response_model=TaskAssignmentPublic)
async def verify_assignment(
    assignment_id: int,
    body: TaskVerification,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin or leader only")
    assignment = await svc.verify_task(session, assignment_id, body, user)
    return await _serialize_assignment(session, assignment)


@router.get("/admin/verification-summary", response_model=AdminVerificationSummary)
async def admin_verification_summary(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.get_admin_summary(session)


@router.get("/tasks/today", response_model=list[TaskAssignmentPublic])
async def my_today_tasks(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    today, pending, blocked = await svc.get_member_tasks(session, user.user_id)
    return [await _serialize_assignment(session, a) for a in today]


@router.get("/tasks/pending-verification", response_model=list[TaskAssignmentPublic])
async def my_pending_verifications(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    today, pending, blocked = await svc.get_member_tasks(session, user.user_id)
    return [await _serialize_assignment(session, a) for a in pending]


@router.get("/tasks/blocked", response_model=list[TaskAssignmentPublic])
async def my_blocked_tasks(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    today, pending, blocked = await svc.get_member_tasks(session, user.user_id)
    return [await _serialize_assignment(session, a) for a in blocked]


@router.get("/tasks/my", response_model=list[TaskAssignmentPublic])
async def my_all_tasks(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(default=None, max_length=20),
):
    q = select(TaskAssignment).where(TaskAssignment.assigned_to_user_id == user.user_id)
    if status:
        q = q.where(TaskAssignment.status == status)
    q = q.order_by(TaskAssignment.created_at.desc())
    rows = (await session.execute(q)).scalars().all()
    return [await _serialize_assignment(session, a) for a in rows]


@router.get("/tasks/execution-score", response_model=dict)
async def my_execution_score(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    score = await svc.compute_execution_score(session, user.user_id)
    return {"execution_score": score}


@router.post("/tasks/{assignment_id}/submit", response_model=TaskAssignmentPublic)
async def submit_evidence(
    assignment_id: int,
    body: TaskEvidenceSubmit,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    assignment = await svc.submit_evidence(session, assignment_id, body, user)
    return await _serialize_assignment(session, assignment)


@router.post("/tasks/{assignment_id}/block", response_model=TaskAssignmentPublic)
async def block_task(
    assignment_id: int,
    body: TaskBlocked,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    assignment = await svc.block_task(session, assignment_id, body, user)
    return await _serialize_assignment(session, assignment)


@router.get("/admin/tasks/all", response_model=list[TaskAssignmentPublic])
async def admin_all_assignments(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(default=None, max_length=20),
    user_id: Optional[int] = Query(default=None),
    leader_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    q = select(TaskAssignment)
    if status:
        q = q.where(TaskAssignment.status == status)
    if user_id:
        q = q.where(TaskAssignment.assigned_to_user_id == user_id)
    if leader_id:
        q = q.where(TaskAssignment.leader_user_id == leader_id)
    q = q.order_by(TaskAssignment.created_at.desc()).offset(offset).limit(limit)
    rows = (await session.execute(q)).scalars().all()
    return [await _serialize_assignment(session, a) for a in rows]


@router.post("/admin/tasks/escalate")
async def run_escalation(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    result = await svc.run_escalation_checks(session)
    return {"escalated": result}


async def _serialize_assignment(
    session: AsyncSession,
    assignment: TaskAssignment,
) -> TaskAssignmentPublic:
    task = await session.get(VerificationTask, assignment.verification_task_id)
    member = await session.get(User, assignment.assigned_to_user_id)
    leader = await session.get(User, assignment.leader_user_id) if assignment.leader_user_id else None
    verifier = await session.get(User, assignment.verified_by_user_id) if assignment.verified_by_user_id else None
    return svc._assignment_to_public(
        assignment,
        task=task,
        member=member,
        leader=leader,
        verifier=verifier,
    )
