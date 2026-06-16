from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.schemas.org_execution import OrgComponentScores, OrganizationScoreResponse
from app.services.leader_effectiveness_service import compute_leader_effectiveness
from app.services.report_eligibility import report_eligibility_conditions


async def compute_org_score(
    session: AsyncSession,
) -> OrganizationScoreResponse:
    now = datetime.now(timezone.utc)

    # Org score = aggregate of all leader effectiveness scores
    leader_response = await compute_leader_effectiveness(session)

    total_members = (
        await session.execute(
            select(func.count(User.id)).where(*report_eligibility_conditions())
        )
    ).scalar() or 0

    total_leads = (
        await session.execute(select(func.count(Lead.id)))
    ).scalar() or 0

    leaders = leader_response.leaders

    if leaders:
        overall_score = round(
            sum(l.weighted_score for l in leaders) / len(leaders), 1
        )
        components = OrgComponentScores(
            mission_completion=round(
                sum(l.components.mission_completion for l in leaders) / len(leaders), 1
            ),
            verification=round(
                sum(l.components.verification_rate for l in leaders) / len(leaders), 1
            ),
            lead_activity=round(
                sum(l.components.lead_activity for l in leaders) / len(leaders), 1
            ),
            zombie_leads=round(
                sum(l.components.zombie_lead_score for l in leaders) / len(leaders), 1
            ),
        )
    else:
        overall_score = 0.0
        components = OrgComponentScores()

    return OrganizationScoreResponse(
        overall_score=overall_score,
        components=components,
        total_members=total_members,
        total_leads=total_leads,
        computed_at=now,
    )
