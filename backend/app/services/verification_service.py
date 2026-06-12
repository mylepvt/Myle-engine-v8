from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser
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


async def _nearest_leader(session: AsyncSession, user_id: int) -> Optional[User]:
    """Walk up the hierarchy to find the nearest upline with role 'leader'."""
    current_id: int | None = user_id
    visited: set[int] = set()
    while current_id is not None and current_id not in visited:
        visited.add(current_id)
        user = await session.get(User, current_id)
        if user is None:
            break
        if user.role == "leader":
            return user
        current_id = user.upline_user_id
    return None


async def _build_chain_snapshot(session: AsyncSession, user_id: int) -> dict[str, Any]:
    """Freeze the leadership chain for audit trail."""
    chain: dict[str, Any] = {"member_user_id": user_id}
    leader = await _nearest_leader(session, user_id)
    if leader:
        chain["leader_user_id"] = leader.id
        chain["leader_name"] = leader.display_name or leader.fbo_id
        upline = await session.get(User, leader.upline_user_id) if leader.upline_user_id else None
        if upline and upline.role == "admin":
            chain["senior_leader_user_id"] = upline.id
        elif upline:
            chain["senior_leader_user_id"] = upline.id
    return chain


def _assignment_to_public(
    assignment: TaskAssignment,
    task: Optional[VerificationTask] = None,
    member: Optional[User] = None,
    leader: Optional[User] = None,
    verifier: Optional[User] = None,
) -> TaskAssignmentPublic:
    """Convert a TaskAssignment row into the public schema."""
    return TaskAssignmentPublic(
        id=assignment.id,
        verification_task_id=assignment.verification_task_id,
        task_title=task.title if task else None,
        task_type=task.task_type if task else None,
        evidence_instructions=task.evidence_instructions if task else None,
        assigned_to_user_id=assignment.assigned_to_user_id,
        assigned_to_name=member.display_name if member else None,
        assigned_by_user_id=assignment.assigned_by_user_id,
        leader_user_id=assignment.leader_user_id,
        leader_name=leader.display_name if leader else None,
        leader_chain_snapshot=assignment.leader_chain_snapshot,
        status=assignment.status,
        evidence_text=assignment.evidence_text,
        evidence_file_url=assignment.evidence_file_url,
        submitted_at=assignment.submitted_at,
        verified_by_user_id=assignment.verified_by_user_id,
        verified_by_name=verifier.display_name if verifier else None,
        verified_at=assignment.verified_at,
        rejection_reason=assignment.rejection_reason,
        blocker_reason=assignment.blocker_reason,
        blocker_notes=assignment.blocker_notes,
        result_produced=assignment.result_produced,
        result_notes=assignment.result_notes,
        due_at=assignment.due_at,
        escalation_level=assignment.escalation_level,
        escalated_at=assignment.escalated_at,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )


async def create_verification_task(
    session: AsyncSession,
    body: VerificationTaskCreate,
    user: AuthUser,
) -> VerificationTask:
    task = VerificationTask(
        title=body.title,
        description=body.description,
        task_type=body.task_type.upper() if body.task_type else "CUSTOM",
        evidence_instructions=body.evidence_instructions,
        created_by_user_id=user.user_id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def list_verification_tasks(
    session: AsyncSession,
    active_only: bool = True,
) -> list[VerificationTask]:
    q = select(VerificationTask)
    if active_only:
        q = q.where(VerificationTask.is_active.is_(True))
    q = q.order_by(VerificationTask.created_at.desc())
    rows = (await session.execute(q)).scalars().all()
    return list(rows)


async def assign_task(
    session: AsyncSession,
    body: TaskAssignmentCreate,
    user: AuthUser,
) -> TaskAssignment:
    task = await session.get(VerificationTask, body.verification_task_id)
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
    member = await session.get(User, body.assigned_to_user_id)
    if member is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    leader = await _nearest_leader(session, body.assigned_to_user_id)
    chain = await _build_chain_snapshot(session, body.assigned_to_user_id)

    assignment = TaskAssignment(
        verification_task_id=body.verification_task_id,
        assigned_to_user_id=body.assigned_to_user_id,
        assigned_by_user_id=user.user_id,
        leader_user_id=leader.id if leader else None,
        leader_chain_snapshot=chain,
        status="pending",
        due_at=body.due_at,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return assignment


async def bulk_assign_task(
    session: AsyncSession,
    body: TaskAssignmentBulkCreate,
    user: AuthUser,
) -> list[TaskAssignment]:
    task = await session.get(VerificationTask, body.verification_task_id)
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")

    assignments: list[TaskAssignment] = []
    for uid in body.user_ids:
        member = await session.get(User, uid)
        if member is None:
            continue
        leader = await _nearest_leader(session, uid)
        chain = await _build_chain_snapshot(session, uid)
        assignment = TaskAssignment(
            verification_task_id=body.verification_task_id,
            assigned_to_user_id=uid,
            assigned_by_user_id=user.user_id,
            leader_user_id=leader.id if leader else None,
            leader_chain_snapshot=chain,
            status="pending",
            due_at=body.due_at,
        )
        session.add(assignment)
        assignments.append(assignment)

    if assignments:
        await session.commit()
        for a in assignments:
            await session.refresh(a)
    return assignments


async def submit_evidence(
    session: AsyncSession,
    assignment_id: int,
    body: TaskEvidenceSubmit,
    user: AuthUser,
) -> TaskAssignment:
    assignment = await session.get(TaskAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.assigned_to_user_id != user.user_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your task")
    if assignment.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit evidence in status '{assignment.status}'",
        )

    if not body.evidence_text and not body.evidence_file_url:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Provide evidence_text or evidence_file_url",
        )

    assignment.evidence_text = body.evidence_text
    assignment.evidence_file_url = body.evidence_file_url
    assignment.submitted_at = datetime.now(timezone.utc)
    assignment.status = "submitted"
    await session.commit()
    await session.refresh(assignment)
    return assignment


async def block_task(
    session: AsyncSession,
    assignment_id: int,
    body: TaskBlocked,
    user: AuthUser,
) -> TaskAssignment:
    assignment = await session.get(TaskAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.assigned_to_user_id != user.user_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your task")
    if assignment.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot block task in status '{assignment.status}'",
        )

    assignment.blocker_reason = body.blocker_reason
    assignment.blocker_notes = body.blocker_notes
    assignment.status = "blocked"
    await session.commit()
    await session.refresh(assignment)
    return assignment


async def verify_task(
    session: AsyncSession,
    assignment_id: int,
    body: TaskVerification,
    user: AuthUser,
) -> TaskAssignment:
    assignment = await session.get(TaskAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.status != "submitted":
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot verify task in status '{assignment.status}'",
        )

    now = datetime.now(timezone.utc)

    if body.action == "verify":
        assignment.status = "verified"
        assignment.verified_by_user_id = user.user_id
        assignment.verified_at = now
        assignment.rejection_reason = None
    elif body.action == "reject":
        assignment.status = "rejected"
        assignment.verified_by_user_id = user.user_id
        assignment.verified_at = now
        assignment.rejection_reason = body.rejection_reason
    elif body.action == "result_produced":
        assignment.status = "result_produced"
        assignment.verified_by_user_id = user.user_id
        assignment.verified_at = now
        assignment.result_produced = True
        assignment.result_notes = body.result_notes
    else:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action '{body.action}'",
        )

    await session.commit()
    await session.refresh(assignment)
    return assignment


async def get_member_tasks(
    session: AsyncSession,
    user_id: int,
) -> tuple[list[TaskAssignment], list[TaskAssignment], list[TaskAssignment]]:
    """Return (today_tasks, pending_verifications, blocked_tasks)."""
    rows = (
        await session.execute(
            select(TaskAssignment)
            .where(TaskAssignment.assigned_to_user_id == user_id)
            .order_by(TaskAssignment.created_at.desc())
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    today_tasks: list[TaskAssignment] = []
    pending_verifications: list[TaskAssignment] = []
    blocked_tasks: list[TaskAssignment] = []

    for a in rows:
        due = a.due_at or a.created_at
        if a.status == "blocked":
            blocked_tasks.append(a)
        elif a.status == "submitted":
            pending_verifications.append(a)
        elif a.status in ("pending", "rejected") and due >= today_start:
            today_tasks.append(a)

    return today_tasks, pending_verifications, blocked_tasks


async def compute_execution_score(
    session: AsyncSession,
    user_id: int,
) -> int:
    """Simple 0-100 score based on recent task completion."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        await session.execute(
            select(TaskAssignment).where(
                TaskAssignment.assigned_to_user_id == user_id,
                TaskAssignment.created_at >= thirty_days_ago,
            )
        )
    ).scalars().all()

    if not rows:
        return 0

    total = len(rows)
    verified = sum(1 for r in rows if r.status in ("verified", "result_produced"))
    submitted = sum(1 for r in rows if r.status == "submitted")
    blocked = sum(1 for r in rows if r.status == "blocked")

    base = int((verified / total) * 60) + int((submitted / total) * 25)
    blocked_penalty = int((blocked / total) * -10)
    return max(0, min(100, base + blocked_penalty))


async def get_admin_summary(
    session: AsyncSession,
) -> AdminVerificationSummary:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total members
    total_members = (
        await session.execute(
            select(func.count()).select_from(User).where(User.role.in_(["team", "leader"]))
        )
    ).scalar() or 0

    # Evidence submitted today
    evidence_today = (
        await session.execute(
            select(func.count())
            .select_from(TaskAssignment)
            .where(
                TaskAssignment.submitted_at >= today_start,
                TaskAssignment.status == "submitted",
            )
        )
    ).scalar() or 0

    # Verified today
    verified_today = (
        await session.execute(
            select(func.count())
            .select_from(TaskAssignment)
            .where(
                TaskAssignment.verified_at >= today_start,
                TaskAssignment.status.in_(["verified", "result_produced"]),
            )
        )
    ).scalar() or 0

    # Pending verifications (all time)
    pending_count = (
        await session.execute(
            select(func.count())
            .select_from(TaskAssignment)
            .where(TaskAssignment.status == "submitted")
        )
    ).scalar() or 0

    # Blocked tasks
    blocked_count = (
        await session.execute(
            select(func.count())
            .select_from(TaskAssignment)
            .where(TaskAssignment.status == "blocked")
        )
    ).scalar() or 0

    # Verification rate (members with at least one submitted evidence)
    members_with_evidence = (
        await session.execute(
            select(func.count(func.distinct(TaskAssignment.assigned_to_user_id))).where(
                TaskAssignment.status.in_(["submitted", "verified", "result_produced"])
            )
        )
    ).scalar() or 0

    rate = (members_with_evidence / total_members * 100) if total_members > 0 else 0.0

    # Leader ranking (by team verification count)
    leader_rows = (
        await session.execute(
            select(
                TaskAssignment.leader_user_id,
                func.count(TaskAssignment.id).label("total_assigned"),
                func.sum(
                    case(
                        (TaskAssignment.status.in_(["verified", "result_produced"]), 1),
                        else_=0,
                    )
                ).label("verified_count"),
            )
            .where(TaskAssignment.leader_user_id.is_not(None))
            .group_by(TaskAssignment.leader_user_id)
            .order_by(
                func.sum(
                    case(
                        (TaskAssignment.status.in_(["verified", "result_produced"]), 1),
                        else_=0,
                    )
                ).desc()
            )
            .limit(20)
        )
    ).all()

    leader_ranking: list[dict[str, Any]] = []
    for row in leader_rows:
        leader = await session.get(User, row.leader_user_id) if row.leader_user_id else None
        leader_ranking.append({
            "user_id": row.leader_user_id,
            "name": leader.display_name if leader else "Unknown",
            "total_assigned": row.total_assigned,
            "verified_count": row.verified_count,
            "verification_rate_pct": round(
                (row.verified_count / row.total_assigned * 100) if row.total_assigned > 0 else 0,
                1,
            ),
        })

    # Task type breakdown
    type_rows = (
        await session.execute(
            select(
                VerificationTask.task_type,
                func.count(TaskAssignment.id).label("count"),
            )
            .join(TaskAssignment, TaskAssignment.verification_task_id == VerificationTask.id)
            .group_by(VerificationTask.task_type)
        )
    ).all()

    task_type_breakdown = [
        {"task_type": row.task_type, "count": row.count} for row in type_rows
    ]

    return AdminVerificationSummary(
        total_members=total_members,
        members_active_today=await _count_active_today(session),
        evidence_today=evidence_today,
        verified_today=verified_today,
        pending_verifications=pending_count,
        blocked_tasks=blocked_count,
        ignored_leads=0,
        verification_rate_pct=round(rate, 1),
        leader_ranking=leader_ranking,
        task_type_breakdown=task_type_breakdown,
    )


async def _count_active_today(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    count = (
        await session.execute(
            select(func.count(func.distinct(TaskAssignment.assigned_to_user_id))).where(
                TaskAssignment.submitted_at >= today_start
            )
        )
    ).scalar() or 0
    return count


async def run_escalation_checks(session: AsyncSession) -> list[dict[str, Any]]:
    """Escalation timer: 24h→leader, 48h→senior, 72h→admin."""
    now = datetime.now(timezone.utc)
    escalated: list[dict[str, Any]] = []

    pending_assignments = (
        await session.execute(
            select(TaskAssignment).where(
                TaskAssignment.status == "pending",
                TaskAssignment.escalation_level < 3,
                TaskAssignment.created_at
                < now - timedelta(hours=24 * (TaskAssignment.escalation_level + 1)),
            )
        )
    ).scalars().all()

    # Re-fetch with specific conditions since SQLAlchemy can't do computed columns
    for a in pending_assignments:
        hours_elapsed = (now - a.created_at).total_seconds() / 3600
        if hours_elapsed < 24:
            continue

        next_level = a.escalation_level + 1
        # Only escalate if we've crossed the threshold for the next level
        if next_level == 1 and hours_elapsed >= 24:
            a.escalation_level = 1
            a.escalated_at = now
            escalated.append({
                "assignment_id": a.id,
                "user_id": a.assigned_to_user_id,
                "escalation_level": 1,
                "target": "leader",
            })
        elif next_level == 2 and hours_elapsed >= 48:
            a.escalation_level = 2
            a.escalated_at = now
            escalated.append({
                "assignment_id": a.id,
                "user_id": a.assigned_to_user_id,
                "escalation_level": 2,
                "target": "senior_leader",
            })
        elif next_level == 3 and hours_elapsed >= 72:
            a.escalation_level = 3
            a.escalated_at = now
            escalated.append({
                "assignment_id": a.id,
                "user_id": a.assigned_to_user_id,
                "escalation_level": 3,
                "target": "admin",
            })

    if escalated:
        await session.commit()

    return escalated
