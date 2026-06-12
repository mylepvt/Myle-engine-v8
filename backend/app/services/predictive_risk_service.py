from datetime import datetime, timezone, timedelta

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_mission import DailyMission, MissionBlocker
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.training_campaign import CampaignEnrollment, TrainingCampaign
from app.models.user import User
from app.schemas.predictive_risk import (
    LeaderRiskScore,
    MemberRiskScore,
    OrgRiskStats,
    PredictiveRiskResponse,
    RiskSignal,
)
from app.services.user_hierarchy import recursive_downline_user_ids


def _member_band(score: float) -> str:
    if score >= 76:
        return "critical"
    if score >= 51:
        return "high"
    if score >= 21:
        return "medium"
    return "low"


def _leader_band(score: float) -> str:
    if score >= 76:
        return "critical"
    if score >= 41:
        return "at_risk"
    return "stable"


async def compute_member_risk(
    session: AsyncSession,
    user_id: int,
    today: datetime.date,
    now: datetime,
) -> MemberRiskScore | None:
    member = await session.get(User, user_id)
    if not member:
        return None
    name = member.name or member.fbo_id or f"User #{user_id}"
    signals: list[RiskSignal] = []

    # 1 — Missed missions (last 7 days)
    missed_count = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id == user_id,
                DailyMission.status != "completed",
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0

    mission_total = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id == user_id,
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0

    if mission_total > 0:
        miss_rate = (missed_count / mission_total) * 100
    else:
        miss_rate = 0.0

    # Scale: 0-3 missed = low, 3-5 = medium, 5+ = high
    if missed_count >= 5:
        miss_score = min(100.0, miss_rate)
    elif missed_count >= 3:
        miss_score = min(70.0, miss_rate)
    elif missed_count > 0:
        miss_score = 30.0
    else:
        miss_score = 0.0

    if miss_score > 0:
        signals.append(RiskSignal(
            type="missed_mission",
            label=f"{missed_count} Missed Missions",
            value=round(miss_score, 1),
            detail=f"{missed_count} of {mission_total} missions not completed in last 7 days",
        ))

    # 2 — Verification decline (submission rate)
    ta_total = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id == user_id,
            )
        )
    ).scalar() or 0
    ta_submitted = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id == user_id,
                TaskAssignment.status.in_(["submitted", "verified", "result_produced"]),
            )
        )
    ).scalar() or 0
    verif_rate = (ta_submitted / ta_total * 100) if ta_total > 0 else 100.0

    if verif_rate < 20:
        verif_score = 100.0
    elif verif_rate < 50:
        verif_score = 60.0
    elif verif_rate < 80:
        verif_score = 25.0
    else:
        verif_score = 0.0

    if verif_score > 0:
        signals.append(RiskSignal(
            type="verification_decline",
            label=f"Verification {verif_rate:.0f}%",
            value=round(verif_score, 1),
            detail=f"Only {ta_submitted} of {ta_total} tasks submitted",
        ))

    # 3 — Lead activity drop
    last_active = (
        await session.execute(
            select(Lead.last_action_at)
            .where(
                Lead.assigned_to_user_id == user_id,
                Lead.last_action_at != None,
            )
            .order_by(Lead.last_action_at.desc())
            .limit(1)
        )
    ).scalar()

    owned_leads = (
        await session.execute(
            select(func.count(Lead.id)).where(Lead.assigned_to_user_id == user_id)
        )
    ).scalar() or 0

    if owned_leads > 0:
        if last_active is None:
            lead_score = 80.0
            signals.append(RiskSignal(
                type="lead_activity_drop",
                label="No Lead Activity",
                value=80.0,
                detail=f"No lead activity ever recorded ({owned_leads} leads assigned)",
            ))
        else:
            days_inactive = (now - last_active).days
            if days_inactive >= 14:
                lead_score = 100.0
            elif days_inactive >= 7:
                lead_score = 70.0
            elif days_inactive >= 3:
                lead_score = 35.0
            else:
                lead_score = 0.0

            if lead_score > 0:
                signals.append(RiskSignal(
                    type="lead_activity_drop",
                    label=f"{days_inactive}d Inactive",
                    value=round(lead_score, 1),
                    detail=f"Last lead activity {days_inactive} days ago",
                ))
    else:
        lead_score = 0.0

    # 4 — Campaign incomplete
    expired_campaign_count = (
        await session.execute(
            select(func.count(CampaignEnrollment.id)).where(
                CampaignEnrollment.user_id == user_id,
                CampaignEnrollment.status != "completed",
                CampaignEnrollment.campaign_id.in_(
                    select(TrainingCampaign.id).where(
                        TrainingCampaign.expiry_date != None,
                        TrainingCampaign.expiry_date < today,
                    )
                ),
            )
        )
    ).scalar() or 0

    camp_score = min(100.0, expired_campaign_count * 35.0)
    if camp_score > 0:
        signals.append(RiskSignal(
            type="campaign_incomplete",
            label=f"{expired_campaign_count} Campaigns Incomplete",
            value=round(camp_score, 1),
            detail=f"{expired_campaign_count} expired campaign(s) not completed",
        ))

    # 5 — Blocker unresolved
    blocker_count = (
        await session.execute(
            select(func.count(MissionBlocker.id))
            .select_from(MissionBlocker)
            .join(DailyMission, MissionBlocker.daily_mission_id == DailyMission.id)
            .where(
                DailyMission.user_id == user_id,
                DailyMission.status != "completed",
            )
        )
    ).scalar() or 0

    blocker_score = min(100.0, blocker_count * 25.0)
    if blocker_score > 0:
        signals.append(RiskSignal(
            type="blocker_unresolved",
            label=f"{blocker_count} Unresolved Blockers",
            value=round(blocker_score, 1),
            detail=f"{blocker_count} blocker(s) on incomplete missions",
        ))

    # Weighted composite score
    weights = {
        "missed_mission": 0.30,
        "verification_decline": 0.25,
        "lead_activity_drop": 0.25,
        "campaign_incomplete": 0.10,
        "blocker_unresolved": 0.10,
    }
    score_map: dict[str, float] = {s.type: s.value for s in signals}
    weighted = sum(
        score_map.get(key, 0.0) * weight
        for key, weight in weights.items()
    )
    score = round(min(100.0, weighted), 1)

    return MemberRiskScore(
        user_id=user_id,
        name=name,
        score=score,
        band=_member_band(score),
        signals=signals,
    )


async def compute_all_member_risks(
    session: AsyncSession,
) -> list[MemberRiskScore]:
    now = datetime.now(timezone.utc)
    today = now.date()

    members = (
        await session.execute(
            select(User).where(
                User.role.in_(["team", "leader"]),
                User.registration_status == "approved",
                User.access_blocked == False,
                User.removed_at == None,
            )
        )
    ).scalars().all()

    results: list[MemberRiskScore] = []
    for member in members:
        risk = await compute_member_risk(session, member.id, today, now)
        if risk and risk.score > 0:
            results.append(risk)

    results.sort(key=lambda r: r.score, reverse=True)
    return results


async def compute_leader_risk(
    session: AsyncSession,
    leader_user_id: int,
    today: datetime.date,
    now: datetime,
) -> LeaderRiskScore | None:
    leader = await session.get(User, leader_user_id)
    if not leader:
        return None
    name = leader.name or leader.fbo_id or f"Leader #{leader_user_id}"

    downline_ids = await recursive_downline_user_ids(session, leader_user_id)
    team_size = len(downline_ids)
    if team_size == 0:
        return None

    signals: list[RiskSignal] = []

    # 1 — Team mission decline
    mission_total = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id.in_(downline_ids),
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0
    mission_completed = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id.in_(downline_ids),
                DailyMission.status == "completed",
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0
    mission_rate = (mission_completed / mission_total * 100) if mission_total > 0 else 100.0
    if mission_rate < 40:
        mission_risk = 100.0
    elif mission_rate < 65:
        mission_risk = 60.0
    elif mission_rate < 85:
        mission_risk = 25.0
    else:
        mission_risk = 0.0
    if mission_risk > 0:
        signals.append(RiskSignal(
            type="team_mission_decline",
            label=f"Mission {mission_rate:.0f}%",
            value=round(mission_risk, 1),
            detail=f"Team completed {mission_completed}/{mission_total} missions (last 7d)",
        ))

    # 2 — Zombie increase
    zombie_count = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.assigned_to_user_id.in_(downline_ids),
                Lead.outcome == "active",
                Lead.last_action_at < func.now() - timedelta(days=7),
            )
        )
    ).scalar() or 0
    active_count = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.assigned_to_user_id.in_(downline_ids),
                Lead.outcome == "active",
            )
        )
    ).scalar() or 0
    zombie_pct = (zombie_count / active_count * 100) if active_count > 0 else 0.0
    if zombie_pct > 50:
        zombie_risk = 100.0
    elif zombie_pct > 30:
        zombie_risk = 60.0
    elif zombie_pct > 15:
        zombie_risk = 25.0
    else:
        zombie_risk = 0.0
    if zombie_risk > 0:
        signals.append(RiskSignal(
            type="zombie_increase",
            label=f"Zombie {zombie_pct:.0f}%",
            value=round(zombie_risk, 1),
            detail=f"{zombie_count} of {active_count} active leads are zombie",
        ))

    # 3 — Verification drop
    ta_total = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id.in_(downline_ids),
            )
        )
    ).scalar() or 0
    ta_submitted = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id.in_(downline_ids),
                TaskAssignment.status.in_(["submitted", "verified", "result_produced"]),
            )
        )
    ).scalar() or 0
    verif_rate = (ta_submitted / ta_total * 100) if ta_total > 0 else 100.0
    if verif_rate < 30:
        verif_risk = 100.0
    elif verif_rate < 55:
        verif_risk = 60.0
    elif verif_rate < 80:
        verif_risk = 25.0
    else:
        verif_risk = 0.0
    if verif_risk > 0:
        signals.append(RiskSignal(
            type="verification_drop",
            label=f"Verification {verif_rate:.0f}%",
            value=round(verif_risk, 1),
            detail=f"Team submitted {ta_submitted}/{ta_total} tasks",
        ))

    # 4 — Conversion drop
    lead_total = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.assigned_to_user_id.in_(downline_ids),
            )
        )
    ).scalar() or 0
    converted = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.assigned_to_user_id.in_(downline_ids),
                Lead.outcome == "converted",
            )
        )
    ).scalar() or 0
    conv_rate = (converted / lead_total * 100) if lead_total > 0 else 0.0
    if conv_rate < 5:
        conv_risk = 100.0
    elif conv_rate < 15:
        conv_risk = 60.0
    elif conv_rate < 25:
        conv_risk = 25.0
    else:
        conv_risk = 0.0
    if conv_risk > 0:
        signals.append(RiskSignal(
            type="conversion_drop",
            label=f"Conversion {conv_rate:.0f}%",
            value=round(conv_risk, 1),
            detail=f"Team converted {converted}/{lead_total} leads",
        ))

    weights = {
        "team_mission_decline": 0.30,
        "zombie_increase": 0.25,
        "verification_drop": 0.25,
        "conversion_drop": 0.20,
    }
    score_map: dict[str, float] = {s.type: s.value for s in signals}
    weighted = sum(
        score_map.get(key, 0.0) * weight
        for key, weight in weights.items()
    )
    score = round(min(100.0, weighted), 1)

    return LeaderRiskScore(
        user_id=leader_user_id,
        name=name,
        score=score,
        band=_leader_band(score),
        team_size=team_size,
        signals=signals,
    )


async def compute_all_leader_risks(
    session: AsyncSession,
) -> list[LeaderRiskScore]:
    now = datetime.now(timezone.utc)
    today = now.date()

    leaders = (
        await session.execute(
            select(User).where(
                User.role == "leader",
                User.registration_status == "approved",
                User.access_blocked == False,
                User.removed_at == None,
            )
        )
    ).scalars().all()

    results: list[LeaderRiskScore] = []
    for leader in leaders:
        risk = await compute_leader_risk(session, leader.id, today, now)
        if risk:
            results.append(risk)

    results.sort(key=lambda r: r.score, reverse=True)
    return results


async def compute_predictive_risk(
    session: AsyncSession,
) -> PredictiveRiskResponse:
    now = datetime.now(timezone.utc)

    member_risks = await compute_all_member_risks(session)
    leader_risks = await compute_all_leader_risks(session)

    total_leaders = len(leader_risks)
    total_members = len(member_risks)

    low = sum(1 for m in member_risks if m.band == "low") if member_risks else 0
    medium = sum(1 for m in member_risks if m.band == "medium") if member_risks else 0
    high = sum(1 for m in member_risks if m.band == "high") if member_risks else 0
    critical = sum(1 for m in member_risks if m.band == "critical") if member_risks else 0
    avg_score = round(sum(m.score for m in member_risks) / len(member_risks), 1) if member_risks else 0.0
    total = max(low + medium + high + critical, 1)

    org_stats = OrgRiskStats(
        total_members=total_members,
        total_leaders=total_leaders,
        low_risk=low,
        medium_risk=medium,
        high_risk=high,
        critical_risk=critical,
        avg_member_score=avg_score,
        band_pct_low=round(low / total * 100, 1),
        band_pct_medium=round(medium / total * 100, 1),
        band_pct_high=round(high / total * 100, 1),
        band_pct_critical=round(critical / total * 100, 1),
    )

    return PredictiveRiskResponse(
        member_risks=member_risks,
        leader_risks=leader_risks,
        org_stats=org_stats,
        computed_at=now,
    )


async def compute_leader_team_risks(
    session: AsyncSession,
    leader_user_id: int,
) -> list[MemberRiskScore]:
    """Return risk for each member in a leader's downline."""
    now = datetime.now(timezone.utc)
    today = now.date()

    downline_ids = await recursive_downline_user_ids(session, leader_user_id)

    results: list[MemberRiskScore] = []
    for uid in downline_ids:
        risk = await compute_member_risk(session, uid, today, now)
        if risk:
            results.append(risk)

    results.sort(key=lambda r: r.score, reverse=True)
    return results
