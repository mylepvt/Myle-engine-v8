from datetime import datetime, timezone, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_mission import MissionBlocker
from app.schemas.blocker_intelligence import BlockerBreakdown, BlockerIntelligence

BLOCKER_LABELS: dict[str, str] = {
    "fear": "Fear of Rejection",
    "no_prospects": "No Prospects",
    "no_time": "Time Management",
    "technical_issue": "Technical Issue",
    "didnt_understand": "Didn't Understand",
    "other": "Other",
}

BLOCKER_SUGGESTIONS: dict[str, str] = {
    "fear": "Biggest Org Bottleneck: Fear of Rejection\n→ Schedule a Fear-Busting Workshop. Role-play cold calls and objections in group sessions. Share successful call recordings daily.",
    "no_prospects": "Biggest Org Bottleneck: No Prospects\n→ Organise a Lead Generation Sprint. Set a team target for new lead creation this week. Activate the Known Zone campaign.",
    "no_time": "Biggest Org Bottleneck: Time Management\n→ Deploy the Calling Sprint campaign. Block 10am–12pm as sacred calling hours. No meetings, no admin during this slot.",
    "technical_issue": "Biggest Org Bottleneck: Technical Issue\n→ Escalate to tech support. Log all reported issues with screenshots. Set up a troubleshooting FAQ for common problems.",
    "didnt_understand": "Biggest Org Bottleneck: Didn't Understand\n→ Schedule a re-training session. Break down the process into smaller steps. Assign a buddy for each affected member.",
    "other": "Biggest Org Bottleneck: Other\n→ Review recent blocker notes to identify patterns. Schedule a one-on-one with affected members.",
}


async def compute_blocker_intelligence(
    session: AsyncSession,
) -> BlockerIntelligence:
    now = datetime.now(timezone.utc)
    today = now.date()

    # Current period: last 30 days
    current_start = today - timedelta(days=30)
    previous_start = today - timedelta(days=60)
    previous_end = today - timedelta(days=30)

    async def _aggregate(start: datetime.date, end: datetime.date) -> tuple[list[BlockerBreakdown], int]:
        rows = (
            await session.execute(
                select(
                    MissionBlocker.reason,
                    func.count(MissionBlocker.id).label("count"),
                )
                .where(
                    MissionBlocker.created_at >= start.isoformat(),
                    MissionBlocker.created_at < end.isoformat(),
                )
                .group_by(MissionBlocker.reason)
                .order_by(func.count(MissionBlocker.id).desc())
            )
        ).all()

        total = sum(row.count for row in rows)
        breakdown = [
            BlockerBreakdown(
                reason=row.reason,
                label=BLOCKER_LABELS.get(row.reason, row.reason.replace("_", " ").title()),
                count=row.count,
                pct=round((row.count / total) * 100, 1) if total > 0 else 0.0,
            )
            for row in rows
        ]
        return breakdown, total

    current_summary, total_current = await _aggregate(current_start, today)
    previous_summary, total_previous = await _aggregate(previous_start, current_start)

    # Biggest blocker
    if current_summary:
        top = current_summary[0]
        biggest = top.reason
        biggest_label = top.label
        biggest_pct = top.pct
    else:
        biggest = ""
        biggest_label = "No blockers recorded"
        biggest_pct = 0.0

    # Suggestion
    suggestion = BLOCKER_SUGGESTIONS.get(biggest, "No suggestion available.")

    return BlockerIntelligence(
        current_summary=current_summary,
        total_current=total_current,
        previous_summary=previous_summary,
        total_previous=total_previous,
        biggest_blocker=biggest,
        biggest_blocker_label=biggest_label,
        biggest_blocker_pct=biggest_pct,
        suggestion=suggestion,
        computed_at=now,
    )
