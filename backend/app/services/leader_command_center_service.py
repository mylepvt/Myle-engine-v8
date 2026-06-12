from datetime import datetime, timezone, timedelta

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.daily_mission import DailyMission, MissionBlocker
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.training_campaign import CampaignEnrollment, TrainingCampaign
from app.models.user import User
from app.schemas.leader_command_center import (
    ActionItem,
    FiresSummary,
    LeaderCommandCenterResponse,
    TeamHealthSummary,
)
from app.services.leader_effectiveness_service import get_leader_own_effectiveness
from app.services.user_hierarchy import recursive_downline_user_ids


async def get_command_center(
    session: AsyncSession,
    leader_user_id: int,
) -> LeaderCommandCenterResponse:
    now = datetime.now(timezone.utc)
    today = now.date()

    downline_ids = await recursive_downline_user_ids(session, leader_user_id)
    team_size = len(downline_ids)

    if team_size == 0:
        return LeaderCommandCenterResponse(
            fires=FiresSummary(),
            team_health=TeamHealthSummary(),
            actions=[],
            team_size=0,
            computed_at=now,
        )

    # ── FIRES ──────────────────────────────────────────────────────

    # 1. Pending verifications
    pending_ver = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id.in_(downline_ids),
                TaskAssignment.status == "submitted",
            )
        )
    ).scalar() or 0

    # 2. Members at risk: 3+ missed missions OR 7d no lead activity OR ver rate < 20%
    members_at_risk = 0
    risk_member_ids: set[int] = set()

    for uid in downline_ids:
        reasons: list[str] = []

        # Check missed missions (last 7 days — count where status != 'completed')
        missed = (
            await session.execute(
                select(func.count(DailyMission.id)).where(
                    DailyMission.user_id == uid,
                    DailyMission.status != "completed",
                    DailyMission.mission_date >= today - timedelta(days=7),
                )
            )
        ).scalar() or 0
        if missed >= 3:
            reasons.append(f"{missed} missed missions")

        # Check inactivity (no lead touched in 7 days)
        last_active = (
            await session.execute(
                select(Lead.last_action_at)
                .where(
                    Lead.assigned_to_user_id == uid,
                    Lead.last_action_at != None,
                )
                .order_by(Lead.last_action_at.desc())
                .limit(1)
            )
        ).scalar()
        if last_active and last_active < now - timedelta(days=7):
            days_inactive = (now - last_active).days
            reasons.append(f"{days_inactive}d inactive")
        elif last_active is None and missed == 0:
            # New member with no activity — not a risk yet
            pass

        if reasons:
            members_at_risk += 1
            risk_member_ids.add(uid)

    # 3. Zombie leads
    zombie_count = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.assigned_to_user_id.in_(downline_ids),
                Lead.outcome == "active",
                Lead.last_action_at < func.now() - func.make_interval(secs=7 * 24 * 3600),
            )
        )
    ).scalar() or 0

    # 4. Campaign failures
    expired = (
        await session.execute(
            select(func.count(TrainingCampaign.id)).where(
                TrainingCampaign.expiry_date != None,
                TrainingCampaign.expiry_date < today,
                TrainingCampaign.is_active == True,
            )
        )
    ).scalar() or 0

    campaign_failures = 0
    campaigns_with_enrollments = (
        await session.execute(
            select(TrainingCampaign.id, TrainingCampaign.expiry_date)
            .join(CampaignEnrollment)
            .where(
                CampaignEnrollment.user_id.in_(downline_ids),
                CampaignEnrollment.status != "completed",
            )
        )
    ).all()
    seen_campaigns = set()
    for cid, expiry in campaigns_with_enrollments:
        if cid in seen_campaigns:
            continue
        seen_campaigns.add(cid)
        if expiry and expiry < today:
            campaign_failures += 1

    # 5. Blockers waiting
    blockers = (
        await session.execute(
            select(func.count(MissionBlocker.id))
            .select_from(MissionBlocker)
            .join(DailyMission, MissionBlocker.daily_mission_id == DailyMission.id)
            .where(
                DailyMission.user_id.in_(downline_ids),
                DailyMission.status != "completed",
            )
        )
    ).scalar() or 0

    # 6. Campaigns running
    campaigns_running = (
        await session.execute(
            select(func.count(TrainingCampaign.id)).where(
                TrainingCampaign.is_active == True,
                TrainingCampaign.id.in_(
                    select(CampaignEnrollment.campaign_id).where(
                        CampaignEnrollment.user_id.in_(downline_ids),
                    )
                ),
            )
        )
    ).scalar() or 0

    fires = FiresSummary(
        pending_verifications=pending_ver,
        members_at_risk=members_at_risk,
        zombie_leads=zombie_count,
        campaign_failures=campaign_failures,
        blockers_waiting=blockers,
        expired_campaigns=expired,
        campaigns_running=campaigns_running,
    )

    # ── TEAM HEALTH ───────────────────────────────────────────────
    leader_eff = await get_leader_own_effectiveness(session, leader_user_id)
    if leader_eff:
        health = TeamHealthSummary(
            mission_completion_pct=leader_eff.components.mission_completion,
            verification_pct=leader_eff.components.verification_rate,
            conversion_pct=leader_eff.components.conversion_rate,
            zombie_score=leader_eff.components.zombie_lead_score,
            blocker_resolution_pct=leader_eff.components.blocker_resolution,
            leader_score=leader_eff.weighted_score,
            leader_band=leader_eff.band,
        )
    else:
        health = TeamHealthSummary()

    # ── ACTIONS ────────────────────────────────────────────────────
    actions: list[ActionItem] = []
    action_members_added: set[int] = set()

    for uid in downline_ids:
        member = await session.get(User, uid)
        member_name = member.name or member.fbo_id or f"User #{uid}" if member else f"User #{uid}"
        # (severity, issue, detail, action_label, action_type, action_ref)
        member_reasons: list[tuple[str, str, str, str, str, str]] = []

        # Missed missions
        missed = (
            await session.execute(
                select(func.count(DailyMission.id)).where(
                    DailyMission.user_id == uid,
                    DailyMission.status != "completed",
                    DailyMission.mission_date >= today - timedelta(days=7),
                )
            )
        ).scalar() or 0
        if missed >= 3:
            member_reasons.append(("critical", f"{missed} missions missed", f"Not completed {missed}/7 daily missions. Call now.", "Call Now", "call", ""))

        # Inactivity
        last_active = (
            await session.execute(
                select(Lead.last_action_at)
                .where(Lead.assigned_to_user_id == uid, Lead.last_action_at != None)
                .order_by(Lead.last_action_at.desc())
                .limit(1)
            )
        ).scalar()
        if last_active and last_active < now - timedelta(days=7):
            days = (now - last_active).days
            member_reasons.append(("critical", f"{days}d no activity", f"No lead activity for {days} days. Check status immediately.", "Check Status", "message", ""))

        # Zombie leads owned
        own_zombies = (
            await session.execute(
                select(func.count(Lead.id)).where(
                    Lead.assigned_to_user_id == uid,
                    Lead.outcome == "active",
                    Lead.last_action_at < func.now() - func.make_interval(secs=7 * 24 * 3600),
                )
            )
        ).scalar() or 0
        if own_zombies >= 3:
            member_reasons.append(("warning", f"{own_zombies} zombie leads", f"{own_zombies} leads untouched >7 days. Review now.", "Review Leads", "review", ""))

        # Pending verification
        own_pending = (
            await session.execute(
                select(func.count(TaskAssignment.id)).where(
                    TaskAssignment.assigned_to_user_id == uid,
                    TaskAssignment.status == "submitted",
                )
            )
        ).scalar() or 0
        if own_pending > 0:
            member_reasons.append(("warning", f"{own_pending} verifications pending", f"{own_pending} submissions waiting for your review.", "Verify Now", "verify", ""))

        # Campaign failures
        own_camp_fails = (
            await session.execute(
                select(func.count(CampaignEnrollment.id)).where(
                    CampaignEnrollment.user_id == uid,
                    CampaignEnrollment.status != "completed",
                    CampaignEnrollment.campaign_id.in_(
                        select(TrainingCampaign.id).where(
                            TrainingCampaign.expiry_date < today,
                            TrainingCampaign.expiry_date != None,
                        )
                    ),
                )
            )
        ).scalar() or 0
        if own_camp_fails > 0:
            member_reasons.append(("warning", f"{own_camp_fails} campaign(s) incomplete", f"Training campaign deadline passed. Follow up.", "Follow Up", "follow_up", ""))

        # Check if user_id is in risk_member_ids but we didn't add reasons above
        if uid in risk_member_ids:
            action_members_added.add(uid)

        for severity, issue, detail, action_label, action_type, action_ref in member_reasons:
            actions.append(ActionItem(
                member_id=uid,
                member_name=member_name,
                issue=issue,
                detail=detail,
                severity=severity,
                action_label=action_label,
                action_type=action_type,
                action_ref=action_ref,
            ))

    # Sort: critical first, then warning, then info
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    actions.sort(key=lambda a: severity_order.get(a.severity, 3))

    return LeaderCommandCenterResponse(
        fires=fires,
        team_health=health,
        actions=actions,
        team_size=team_size,
        computed_at=now,
    )
