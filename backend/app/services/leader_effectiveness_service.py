from datetime import datetime, timezone

from sqlalchemy import Date, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_mission import DailyMission, MissionBlocker
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.user import User
from app.schemas.leader_effectiveness import (
    LeaderComponentScores,
    LeaderEffectivenessPublic,
    LeaderEffectivenessResponse,
)
from app.services.user_hierarchy import recursive_downline_user_ids

WEIGHTS = {
    "mission_completion": 0.25,
    "verification_rate": 0.25,
    "conversion_rate": 0.20,
    "zombie_lead": 0.20,
    "blocker_resolution": 0.10,
}


def _band(score: float) -> str:
    if score >= 80:
        return "elite"
    if score >= 40:
        return "average"
    return "critical"


def _weakest(comps: LeaderComponentScores) -> str | None:
    mapping = {
        "Mission Completion": comps.mission_completion,
        "Verification Rate": comps.verification_rate,
        "Conversion Rate": comps.conversion_rate,
        "Zombie Leads": comps.zombie_lead_score,
        "Blocker Resolution": comps.blocker_resolution,
    }
    min_key = min(mapping, key=mapping.get)
    return None if mapping[min_key] >= 50 else min_key


async def compute_leader_effectiveness(
    session: AsyncSession,
) -> LeaderEffectivenessResponse:
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

    results: list[LeaderEffectivenessPublic] = []

    for leader in leaders:
        downline_ids = await recursive_downline_user_ids(session, leader.id)
        team_size = len(downline_ids)
        if team_size == 0:
            continue

        # 1 — Team Mission Completion (25%)
        dm_count = (
            await session.execute(
                select(
                    func.count(DailyMission.id).label("total"),
                    func.sum(
                        case((DailyMission.status == "completed", 1), else_=0)
                    ).label("completed"),
                ).where(
                    DailyMission.user_id.in_(downline_ids),
                    DailyMission.mission_date == today,
                )
            )
        ).one()
        total_missions = dm_count.total or 0
        completed_missions = dm_count.completed or 0
        mission_completion = (
            (completed_missions / total_missions * 100) if total_missions > 0 else 0.0
        )

        # 2 — Team Verification Rate (25%)
        ta_count = (
            await session.execute(
                select(
                    func.count(TaskAssignment.id).label("total"),
                    func.sum(
                        case(
                            (
                                TaskAssignment.status.in_(
                                    ["submitted", "verified", "result_produced"]
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ).label("submitted_or_done"),
                ).where(TaskAssignment.assigned_to_user_id.in_(downline_ids))
            )
        ).one()
        total_tasks = ta_count.total or 0
        submitted_or_done = ta_count.submitted_or_done or 0
        verification_rate = (
            (submitted_or_done / total_tasks * 100) if total_tasks > 0 else 0.0
        )

        # 3 — Team Conversion Rate (20%)
        lead_counts = (
            await session.execute(
                select(
                    func.count(Lead.id).label("total"),
                    func.sum(
                        case((Lead.outcome == "converted", 1), else_=0)
                    ).label("converted"),
                ).where(Lead.assigned_to_user_id.in_(downline_ids))
            )
        ).one()
        total_leads = lead_counts.total or 0
        converted = lead_counts.converted or 0
        conversion_rate = (
            (converted / total_leads * 100) if total_leads > 0 else 0.0
        )

        # 4 — Team Zombie Lead % (20%) — inverted score
        zombie_count = (
            await session.execute(
                select(func.count(Lead.id)).where(
                    Lead.assigned_to_user_id.in_(downline_ids),
                    Lead.outcome == "active",
                    Lead.last_action_at
                    < func.now() - func.make_interval(secs=7 * 24 * 3600),
                )
            )
        ).scalar() or 0
        active_total = (
            await session.execute(
                select(func.count(Lead.id)).where(
                    Lead.assigned_to_user_id.in_(downline_ids),
                    Lead.outcome == "active",
                )
            )
        ).scalar() or 0
        zombie_pct = (
            (zombie_count / active_total * 100) if active_total > 0 else 0.0
        )
        zombie_lead_score = max(0.0, 100.0 - zombie_pct)

        # 5 — Team Blocker Resolution (10%)
        blocker_counts = (
            await session.execute(
                select(
                    func.count(MissionBlocker.id).label("total"),
                    func.sum(
                        case((DailyMission.status == "completed", 1), else_=0)
                    ).label("resolved"),
                )
                .select_from(MissionBlocker)
                .join(
                    DailyMission,
                    MissionBlocker.daily_mission_id == DailyMission.id,
                )
                .where(DailyMission.user_id.in_(downline_ids))
            )
        ).one()
        total_blockers = blocker_counts.total or 0
        resolved_blockers = blocker_counts.resolved or 0
        blocker_resolution = (
            (resolved_blockers / total_blockers * 100)
            if total_blockers > 0
            else 0.0
        )

        # 6 — Lead Activity (tracked for org aggregation, not weighted)
        active_users = (
            await session.execute(
                select(func.count(func.distinct(User.id))).where(
                    User.id.in_(
                        select(Lead.created_by_user_id)
                        .where(
                            cast(Lead.created_at, Date) == today,
                            Lead.created_by_user_id != None,
                        )
                        .union(
                            select(Lead.assigned_to_user_id).where(
                                cast(Lead.last_action_at, Date) == today,
                                Lead.assigned_to_user_id != None,
                            )
                        )
                    ),
                    User.id.in_(downline_ids),
                )
            )
        ).scalar() or 0
        lead_activity = round((active_users / max(team_size, 1)) * 100, 1)

        components = LeaderComponentScores(
            mission_completion=round(mission_completion, 1),
            verification_rate=round(verification_rate, 1),
            conversion_rate=round(conversion_rate, 1),
            zombie_lead_score=round(zombie_lead_score, 1),
            blocker_resolution=round(blocker_resolution, 1),
            lead_activity=lead_activity,
        )

        weighted = (
            mission_completion * WEIGHTS["mission_completion"]
            + verification_rate * WEIGHTS["verification_rate"]
            + conversion_rate * WEIGHTS["conversion_rate"]
            + zombie_lead_score * WEIGHTS["zombie_lead"]
            + blocker_resolution * WEIGHTS["blocker_resolution"]
        )
        weighted = round(weighted, 1)

        results.append(
            LeaderEffectivenessPublic(
                user_id=leader.id,
                name=leader.name or leader.fbo_id or f"Leader #{leader.id}",
                team_size=team_size,
                weighted_score=weighted,
                band=_band(weighted),
                components=components,
                weakest_component=_weakest(components),
            )
        )

    results.sort(key=lambda r: r.weighted_score, reverse=True)

    avg = (
        round(sum(r.weighted_score for r in results) / len(results), 1)
        if results
        else 0.0
    )
    dist = {
        "elite": sum(1 for r in results if r.band == "elite"),
        "average": sum(1 for r in results if r.band == "average"),
        "critical": sum(1 for r in results if r.band == "critical"),
    }

    return LeaderEffectivenessResponse(
        leaders=results,
        total_leaders=len(results),
        average_score=avg,
        band_distribution=dist,
        computed_at=now,
    )


async def get_leader_own_effectiveness(
    session: AsyncSession,
    leader_user_id: int,
) -> LeaderEffectivenessPublic | None:
    response = await compute_leader_effectiveness(session)
    for leader in response.leaders:
        if leader.user_id == leader_user_id:
            return leader
    return None
