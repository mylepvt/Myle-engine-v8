from datetime import datetime, timezone, timedelta
from typing import Any

from pydantic import BaseModel, field_validator
from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_mission import DailyMission, MissionBlocker
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.training_campaign import CampaignEnrollment, TrainingCampaign
from app.models.user import User
from app.services.leader_effectiveness_service import compute_leader_effectiveness
from app.services.org_execution_service import compute_org_score
from app.services.predictive_risk_service import compute_all_member_risks, compute_all_leader_risks
from app.services.blocker_intelligence_service import compute_blocker_intelligence


class EosHealthComponents(BaseModel):
    org_score: float = 0.0
    avg_leader_score: float = 0.0
    mission_completion: float = 0.0
    verification_rate: float = 0.0
    conversion_rate: float = 0.0
    zombie_pct: float = 0.0
    risk_score: float = 0.0
    campaign_success_pct: float = 0.0


class EosHealthResponse(BaseModel):
    health_score: float
    components: EosHealthComponents
    band: str  # excellent / good / fair / poor / critical
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


def _health_band(score: float) -> str:
    if score >= 90:
        return "excellent"
    if score >= 75:
        return "good"
    if score >= 55:
        return "fair"
    if score >= 35:
        return "poor"
    return "critical"


async def compute_eos_health(session: AsyncSession) -> EosHealthResponse:
    now = datetime.now(timezone.utc)
    today = now.date()

    # 1 — Org Score
    org_resp = await compute_org_score(session)
    org_score = org_resp.overall_score if org_resp else 0.0

    # 2 — Avg Leader Score
    leader_resp = await compute_leader_effectiveness(session)
    avg_leader_score = leader_resp.average_score if leader_resp else 0.0

    # 3 — Mission completion (last 7 days)
    mission_total = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0
    mission_completed = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.status == "completed",
                DailyMission.mission_date >= today - timedelta(days=7),
            )
        )
    ).scalar() or 0
    mission_completion = round((mission_completed / mission_total * 100) if mission_total > 0 else 0.0, 1)

    # 4 — Verification rate
    ta_total = (
        await session.execute(select(func.count(TaskAssignment.id)))
    ).scalar() or 0
    ta_submitted = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.status.in_(["submitted", "verified", "result_produced"]),
            )
        )
    ).scalar() or 0
    verification_rate = round((ta_submitted / ta_total * 100) if ta_total > 0 else 0.0, 1)

    # 5 — Conversion rate
    lead_total = (
        await session.execute(select(func.count(Lead.id)))
    ).scalar() or 0
    converted = (
        await session.execute(
            select(func.count(Lead.id)).where(Lead.outcome == "converted")
        )
    ).scalar() or 0
    conversion_rate = round((converted / lead_total * 100) if lead_total > 0 else 0.0, 1)

    # 6 — Zombie %
    zombie_count = (
        await session.execute(
            select(func.count(Lead.id)).where(
                Lead.outcome == "active",
                Lead.last_action_at < func.now() - func.make_interval(secs=7 * 24 * 3600),
            )
        )
    ).scalar() or 0
    active_total = (
        await session.execute(
            select(func.count(Lead.id)).where(Lead.outcome == "active")
        )
    ).scalar() or 0
    zombie_pct = round((zombie_count / active_total * 100) if active_total > 0 else 0.0, 1)

    # 7 — Risk score (from member risk engine)
    member_risks = await compute_all_member_risks(session)
    avg_risk = round(sum(m.score for m in member_risks) / len(member_risks), 1) if member_risks else 0.0
    risk_score = max(0.0, 100.0 - avg_risk)  # Invert: high risk → low health

    # 8 — Campaign success rate
    enrolled = (
        await session.execute(
            select(func.count(CampaignEnrollment.id))
        )
    ).scalar() or 0
    completed_enrollments = (
        await session.execute(
            select(func.count(CampaignEnrollment.id)).where(
                CampaignEnrollment.status == "completed",
            )
        )
    ).scalar() or 0
    campaign_success_pct = round((completed_enrollments / enrolled * 100) if enrolled > 0 else 0.0, 1)

    components = EosHealthComponents(
        org_score=round(org_score, 1),
        avg_leader_score=round(avg_leader_score, 1),
        mission_completion=org_resp.components.mission_completion if org_resp else 0.0,
        verification_rate=org_resp.components.verification if org_resp else 0.0,
        conversion_rate=conversion_rate,
        zombie_pct=zombie_pct,
        risk_score=round(risk_score, 1),
        campaign_success_pct=campaign_success_pct,
    )

    # Weighted health score
    # Org Score: 25%, Leader Score: 15%, Mission: 15%, Verification: 15%, Conversion: 10%, Zombie (inverted): 10%, Risk: 5%, Campaign: 5%
    zombie_health = max(0.0, 100.0 - zombie_pct)

    health_score = round(
        org_score * 0.25
        + avg_leader_score * 0.15
        + mission_completion * 0.15
        + verification_rate * 0.15
        + conversion_rate * 0.10
        + zombie_health * 0.10
        + risk_score * 0.05
        + campaign_success_pct * 0.05
    , 1)

    return EosHealthResponse(
        health_score=health_score,
        components=components,
        band=_health_band(health_score),
        computed_at=now,
    )
