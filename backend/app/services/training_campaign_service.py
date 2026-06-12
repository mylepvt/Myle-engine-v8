from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import and_, case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.task_assignment import TaskAssignment
from app.models.training_campaign import (
    CampaignEnrollment,
    CampaignMemberProgress,
    CampaignMission,
    TrainingCampaign,
)
from app.models.user import User
from app.models.verification_task import VerificationTask
from app.schemas.training_campaign import (
    CampaignCreate,
    CampaignEnrollmentPublic,
    CampaignMemberProgressPublic,
    CampaignMetrics,
    CampaignMissionCreate,
    CampaignMissionPublic,
    CampaignPublic,
    CampaignVerifyRequest,
)


# ── CRUD: Campaign ──────────────────────────────────────────────


async def create_campaign(
    session: AsyncSession,
    body: CampaignCreate,
    created_by_user_id: int,
) -> CampaignPublic:
    campaign = TrainingCampaign(
        name=body.name,
        description=body.description,
        webinar_date=body.webinar_date,
        expiry_date=body.expiry_date,
        created_by_user_id=created_by_user_id,
    )
    session.add(campaign)
    await session.flush()

    for m in body.missions:
        session.add(
            CampaignMission(
                campaign_id=campaign.id,
                item_key=m.item_key,
                label=m.label,
                target=m.target,
                verification_required=m.verification_required,
                evidence_instructions=m.evidence_instructions,
                sort_order=m.sort_order,
            )
        )
    await session.commit()
    return await _load_campaign(session, campaign.id)


async def list_campaigns(
    session: AsyncSession,
    active_only: bool = True,
) -> list[CampaignPublic]:
    q = select(TrainingCampaign).options(
        selectinload(TrainingCampaign.missions),
        selectinload(TrainingCampaign.enrollments),
    ).order_by(TrainingCampaign.created_at.desc())
    if active_only:
        q = q.where(TrainingCampaign.is_active == True)
    rows = (await session.execute(q)).scalars().unique().all()
    return [_campaign_to_public(c) for c in rows]


async def get_campaign(
    session: AsyncSession,
    campaign_id: int,
) -> Optional[CampaignPublic]:
    return await _load_campaign(session, campaign_id)


async def _load_campaign(
    session: AsyncSession,
    campaign_id: int,
) -> Optional[CampaignPublic]:
    c = (
        await session.execute(
            select(TrainingCampaign)
            .options(
                selectinload(TrainingCampaign.missions),
                selectinload(TrainingCampaign.enrollments),
            )
            .where(TrainingCampaign.id == campaign_id)
        )
    ).scalars().first()
    if c is None:
        return None
    return _campaign_to_public(c)


def _campaign_to_public(c: TrainingCampaign) -> CampaignPublic:
    return CampaignPublic(
        id=c.id,
        name=c.name,
        description=c.description,
        webinar_date=c.webinar_date,
        expiry_date=c.expiry_date,
        is_active=c.is_active,
        missions=[
            CampaignMissionPublic(
                id=m.id,
                item_key=m.item_key,
                label=m.label,
                target=m.target,
                verification_required=m.verification_required,
                evidence_instructions=m.evidence_instructions,
                sort_order=m.sort_order,
            )
            for m in sorted(c.missions, key=lambda x: x.sort_order)
        ],
        enrollment_count=len(c.enrollments),
        created_at=c.created_at,
    )


# ── Enrollment ─────────────────────────────────────────────────────


async def enroll_members(
    session: AsyncSession,
    campaign_id: int,
    user_ids: list[int],
) -> int:
    added = 0
    for uid in user_ids:
        exists = (
            await session.execute(
                select(CampaignEnrollment.id).where(
                    CampaignEnrollment.campaign_id == campaign_id,
                    CampaignEnrollment.user_id == uid,
                )
            )
        ).scalar_one_or_none()
        if exists:
            continue
        enrollment = CampaignEnrollment(
            campaign_id=campaign_id,
            user_id=uid,
        )
        session.add(enrollment)

        # Create progress rows for each mission
        missions = (
            await session.execute(
                select(CampaignMission).where(
                    CampaignMission.campaign_id == campaign_id
                )
            )
        ).scalars().all()
        for m in missions:
            session.add(
                CampaignMemberProgress(
                    enrollment=enrollment,  # auto-flush
                    campaign_mission_id=m.id,
                )
            )
        added += 1

    await session.commit()
    return added


async def get_enrollments(
    session: AsyncSession,
    campaign_id: int,
) -> list[CampaignEnrollmentPublic]:
    rows = (
        await session.execute(
            select(CampaignEnrollment)
            .options(
                selectinload(CampaignEnrollment.progress),
                joinedload(CampaignEnrollment.user),
            )
            .where(CampaignEnrollment.campaign_id == campaign_id)
            .order_by(CampaignEnrollment.enrolled_at.desc())
        )
    ).scalars().unique().all()

    missions = {
        m.id: m
        for m in (
            await session.execute(
                select(CampaignMission).where(
                    CampaignMission.campaign_id == campaign_id
                )
            )
        ).scalars().all()
    }

    result = []
    for e in rows:
        progress = []
        for p in sorted(e.progress, key=lambda x: missions.get(x.campaign_mission_id, CampaignMission(id=0, sort_order=0, item_key="", label="", target=1)).sort_order):
            mission = missions.get(p.campaign_mission_id)
            progress.append(
                CampaignMemberProgressPublic(
                    id=p.id,
                    campaign_mission_id=p.campaign_mission_id,
                    label=mission.label if mission else "?",
                    target=mission.target if mission else 1,
                    achieved=p.achieved,
                    evidence=p.evidence,
                    status=p.status,
                    verified_by_user_id=p.verified_by_user_id,
                    verified_at=p.verified_at.isoformat() if p.verified_at else None,
                    rejection_reason=p.rejection_reason,
                )
            )
        result.append(
            CampaignEnrollmentPublic(
                id=e.id,
                campaign_id=e.campaign_id,
                user_id=e.user_id,
                user_name=e.user.name if e.user else None,
                status=e.status,
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                progress=progress,
            )
        )
    return result


# ── Member: submit progress ──────────────────────────────────────


async def submit_progress(
    session: AsyncSession,
    enrollment_id: int,
    campaign_mission_id: int,
    achieved: int,
    evidence: Optional[str],
) -> Optional[CampaignMemberProgressPublic]:
    from app.services.verification_service import _build_chain_snapshot, _nearest_leader

    progress = (
        await session.execute(
            select(CampaignMemberProgress).where(
                CampaignMemberProgress.enrollment_id == enrollment_id,
                CampaignMemberProgress.campaign_mission_id == campaign_mission_id,
            )
        )
    ).scalar_one_or_none()
    if progress is None:
        return None

    enrollment = await session.get(CampaignEnrollment, enrollment_id)
    if enrollment is None:
        return None

    progress.achieved = achieved
    if evidence:
        progress.evidence = evidence

    mission = (
        await session.execute(
            select(CampaignMission).where(
                CampaignMission.id == campaign_mission_id
            )
        )
    ).scalar_one_or_none()

    # If evidence provided AND verification required → create VerificationTask + TaskAssignment
    if evidence and mission and mission.verification_required:
        # Create a VerificationTask for this campaign mission
        vtask = VerificationTask(
            title=f"Campaign: {mission.label}",
            description=mission.evidence_instructions or mission.label,
            task_type="TRAINING",
            evidence_instructions=mission.evidence_instructions,
        )
        session.add(vtask)
        await session.flush()

        leader = await _nearest_leader(session, enrollment.user_id)
        chain = await _build_chain_snapshot(session, enrollment.user_id)

        assignment = TaskAssignment(
            verification_task_id=vtask.id,
            assigned_to_user_id=enrollment.user_id,
            assigned_by_user_id=0,  # system
            leader_user_id=leader.id if leader else None,
            leader_chain_snapshot=chain,
            status="submitted",
            evidence_text=evidence,
            submitted_at=datetime.now(timezone.utc),
        )
        session.add(assignment)
        progress.status = "submitted"
    elif mission and not mission.verification_required:
        progress.status = "verified"
    else:
        progress.status = "submitted"

    await _check_enrollment_completion(session, enrollment_id)
    await session.commit()

    return CampaignMemberProgressPublic(
        id=progress.id,
        campaign_mission_id=progress.campaign_mission_id,
        label=mission.label if mission else "?",
        target=mission.target if mission else 1,
        achieved=progress.achieved,
        evidence=progress.evidence,
        status=progress.status,
        verified_by_user_id=progress.verified_by_user_id,
        verified_at=progress.verified_at.isoformat() if progress.verified_at else None,
        rejection_reason=progress.rejection_reason,
    )


async def verify_progress(
    session: AsyncSession,
    body: CampaignVerifyRequest,
    leader_user_id: int,
) -> Optional[CampaignMemberProgressPublic]:
    progress = (
        await session.execute(
            select(CampaignMemberProgress).where(
                CampaignMemberProgress.id == body.progress_id
            )
        )
    ).scalar_one_or_none()
    if progress is None:
        return None

    # Also update the linked TaskAssignment if it exists
    enrollment = await session.get(CampaignEnrollment, progress.enrollment_id)
    if enrollment:
        mission = await session.get(CampaignMission, progress.campaign_mission_id)

    if body.approved:
        progress.status = "verified"
        progress.verified_by_user_id = leader_user_id
        progress.verified_at = datetime.now(timezone.utc)
        progress.rejection_reason = None

        # Sync TaskAssignment (find matching one by user + campaign context)
        if enrollment and mission:
            task_assignments = (
                await session.execute(
                    select(TaskAssignment)
                    .join(VerificationTask)
                    .where(
                        TaskAssignment.assigned_to_user_id == enrollment.user_id,
                        TaskAssignment.status == "submitted",
                        VerificationTask.title == f"Campaign: {mission.label}",
                    )
                )
            ).scalars().all()
            for ta in task_assignments:
                ta.status = "verified"
                ta.verified_by_user_id = leader_user_id
                ta.verified_at = datetime.now(timezone.utc)
    else:
        progress.status = "rejected"
        progress.rejection_reason = body.rejection_reason
        progress.verified_by_user_id = None
        progress.verified_at = None

        if enrollment and mission:
            task_assignments = (
                await session.execute(
                    select(TaskAssignment)
                    .join(VerificationTask)
                    .where(
                        TaskAssignment.assigned_to_user_id == enrollment.user_id,
                        TaskAssignment.status == "submitted",
                        VerificationTask.title == f"Campaign: {mission.label}",
                    )
                )
            ).scalars().all()
            for ta in task_assignments:
                ta.status = "rejected"
                ta.rejection_reason = body.rejection_reason

    mission = (
        await session.execute(
            select(CampaignMission).where(
                CampaignMission.id == progress.campaign_mission_id
            )
        )
    ).scalar_one_or_none()
    await _check_enrollment_completion(session, progress.enrollment_id)
    await session.commit()

    return CampaignMemberProgressPublic(
        id=progress.id,
        campaign_mission_id=progress.campaign_mission_id,
        label=mission.label if mission else "?",
        target=mission.target if mission else 1,
        achieved=progress.achieved,
        evidence=progress.evidence,
        status=progress.status,
        verified_by_user_id=progress.verified_by_user_id,
        verified_at=progress.verified_at.isoformat() if progress.verified_at else None,
        rejection_reason=progress.rejection_reason,
    )


async def _check_enrollment_completion(
    session: AsyncSession,
    enrollment_id: int,
) -> None:
    enrollment = (
        await session.execute(
            select(CampaignEnrollment)
            .options(selectinload(CampaignEnrollment.progress))
            .where(CampaignEnrollment.id == enrollment_id)
        )
    ).scalars().first()
    if enrollment is None:
        return

    all_verified = all(
        p.status == "verified" for p in enrollment.progress
    )
    if all_verified and enrollment.status != "completed":
        enrollment.status = "completed"
        enrollment.completed_at = datetime.now(timezone.utc)


# ── Metrics ────────────────────────────────────────────────────────


async def get_campaign_metrics(
    session: AsyncSession,
    campaign_id: int,
) -> CampaignMetrics:
    enrollments = (
        await session.execute(
            select(CampaignEnrollment)
            .options(selectinload(CampaignEnrollment.progress))
            .where(CampaignEnrollment.campaign_id == campaign_id)
        )
    ).scalars().unique().all()

    total_missions = (
        await session.execute(
            select(func.count(CampaignMission.id)).where(
                CampaignMission.campaign_id == campaign_id
            )
        )
    ).scalar() or 0

    total_enrolled = len(enrollments)
    implementation = sum(
        1 for e in enrollments
        if any(p.achieved > 0 for p in e.progress)
    )
    success = sum(
        1 for e in enrollments
        if all(p.status == "verified" for p in e.progress)
    )

    return CampaignMetrics(
        attendance=total_enrolled,
        implementation=implementation,
        implementation_pct=round((implementation / max(total_enrolled, 1)) * 100, 1),
        success=success,
        success_pct=round((success / max(total_enrolled, 1)) * 100, 1),
        total_enrolled=total_enrolled,
        total_missions=total_missions,
    )


async def get_member_campaigns(
    session: AsyncSession,
    user_id: int,
    campaign_id: Optional[int] = None,
) -> list[CampaignEnrollmentPublic]:
    q = (
        select(CampaignEnrollment)
        .options(
            selectinload(CampaignEnrollment.progress),
            joinedload(CampaignEnrollment.campaign),
            joinedload(CampaignEnrollment.user),
        )
        .where(CampaignEnrollment.user_id == user_id)
        .order_by(CampaignEnrollment.enrolled_at.desc())
    )
    if campaign_id:
        q = q.where(CampaignEnrollment.campaign_id == campaign_id)

    rows = (await session.execute(q)).scalars().unique().all()

    # Collect all campaign IDs to load their missions
    campaign_ids = {e.campaign_id for e in rows}
    missions_by_campaign: dict[int, dict[int, CampaignMission]] = {}
    for cid in campaign_ids:
        ms = (
            await session.execute(
                select(CampaignMission).where(
                    CampaignMission.campaign_id == cid
                ).order_by(CampaignMission.sort_order)
            )
        ).scalars().all()
        missions_by_campaign[cid] = {m.id: m for m in ms}

    result = []
    for e in rows:
        missions = missions_by_campaign.get(e.campaign_id, {})
        progress = []
        for p in e.progress:
            mission = missions.get(p.campaign_mission_id)
            progress.append(
                CampaignMemberProgressPublic(
                    id=p.id,
                    campaign_mission_id=p.campaign_mission_id,
                    label=mission.label if mission else "?",
                    target=mission.target if mission else 1,
                    achieved=p.achieved,
                    evidence=p.evidence,
                    status=p.status,
                    verified_by_user_id=p.verified_by_user_id,
                    verified_at=p.verified_at.isoformat() if p.verified_at else None,
                    rejection_reason=p.rejection_reason,
                )
            )
        result.append(
            CampaignEnrollmentPublic(
                id=e.id,
                campaign_id=e.campaign_id,
                user_id=e.user_id,
                user_name=e.user.name if e.user else None,
                status=e.status,
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                progress=progress,
            )
        )
    return result
