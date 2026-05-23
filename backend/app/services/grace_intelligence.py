"""Grace request intelligence — history recording, risk scoring, frequency tracking."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grace_history import GraceHistory
from app.models.user import User

MONTHLY_GRACE_LIMIT = 2

GraceRisk = Literal["low", "medium", "high"]


def _compute_risk(count_30d: int, last_outcome: str | None) -> GraceRisk:
    """
    Risk reflects likelihood of grace being abused based on recent history.

    high  → 2+ approved this month, OR 1 approved + last one ended in auto_removed
    medium → 1 approved this month, OR last grace ended in removal/cleared early
    low   → no recent approved graces and no bad track record
    """
    if count_30d >= 2:
        return "high"
    if count_30d >= 1 and last_outcome == "auto_removed":
        return "high"
    if count_30d >= 1 or last_outcome in ("auto_removed", "cleared"):
        return "medium"
    return "low"


def record_grace_outcome(
    *,
    session: AsyncSession,
    user: User,
    outcome: str,
    outcome_at: datetime,
    final_end_date: object = None,
    action_by_user_id: int | None = None,
    calls_streak_at_request: int | None = None,
    report_streak_at_request: int | None = None,
) -> None:
    """
    Append an immutable grace history entry.
    Synchronous — uses session.add() only. Caller must commit.
    """
    session.add(
        GraceHistory(
            user_id=user.id,
            requested_at=user.grace_request_requested_at,
            requested_end_date=user.grace_request_end_date or user.grace_end_date,
            request_reason=(user.grace_request_reason or user.grace_reason or "").strip() or None,
            calls_streak_at_request=calls_streak_at_request,
            report_streak_at_request=report_streak_at_request,
            outcome=outcome,
            outcome_at=outcome_at,
            final_end_date=final_end_date,
            action_by_user_id=action_by_user_id,
        )
    )


async def get_grace_contexts_batch(
    session: AsyncSession,
    user_ids: list[int],
) -> dict[int, dict]:
    """
    Batch-load grace intelligence for multiple users.
    Returns dict keyed by user_id with keys: risk, count_30d, last_outcome.
    """
    if not user_ids:
        return {}

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    rows = (
        await session.execute(
            select(GraceHistory)
            .where(GraceHistory.user_id.in_(user_ids))
            .order_by(GraceHistory.outcome_at.desc())
        )
    ).scalars().all()

    by_user: dict[int, list[GraceHistory]] = {uid: [] for uid in user_ids}
    for row in rows:
        by_user[row.user_id].append(row)

    result: dict[int, dict] = {}
    for uid in user_ids:
        history = by_user[uid]
        count_30d = sum(
            1 for h in history
            if h.outcome == "approved" and h.outcome_at >= cutoff
        )
        # Last meaningful outcome (rejections don't affect track record)
        last = next((h for h in history if h.outcome != "rejected"), None)
        last_outcome = last.outcome if last else None
        result[uid] = {
            "risk": _compute_risk(count_30d, last_outcome),
            "count_30d": count_30d,
            "last_outcome": last_outcome,
        }

    return result


async def get_grace_context(session: AsyncSession, user_id: int) -> dict:
    """Load grace intelligence for a single user."""
    ctx = await get_grace_contexts_batch(session, [user_id])
    return ctx.get(user_id, {"risk": "low", "count_30d": 0, "last_outcome": None})
