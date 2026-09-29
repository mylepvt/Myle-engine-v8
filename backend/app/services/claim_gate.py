"""Pool claim gate — members must cover yesterday's fresh leads before claiming more.

A claimed lead is "covered" once its status has moved past ``new_lead`` (any
status update: contacted, invited, retarget, lost, …). Leads claimed earlier
today never block — only leads from previous IST days do.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.lead import Lead

# ActivityLog action written when a member claims from the paid pool (wallet-debited
# fresh leads). Free-pool claims ("lead.claimed_free") are intentionally excluded.
POOL_CLAIM_ACTIONS: tuple[str, ...] = ("lead.claimed",)

# Claimed leads stay on the member's "Today" tab while in these stages.
TODAY_WORKING_STATUSES: tuple[str, ...] = (
    "new_lead",
    "contacted",
    "invited",
    "video_sent",
    "video_watched",
)

UNCOVERED_STATUS = "new_lead"


def pool_claim_exists(*, user_id: int | None = None, before: datetime | None = None):
    """Correlated EXISTS: ``Lead`` was claimed from a pool (optionally by user / before ts)."""
    conds = [
        ActivityLog.entity_type == "lead",
        ActivityLog.entity_id == Lead.id,
        ActivityLog.action.in_(POOL_CLAIM_ACTIONS),
    ]
    if user_id is not None:
        conds.append(ActivityLog.user_id == user_id)
    if before is not None:
        conds.append(ActivityLog.created_at < before)
    return exists(select(1).where(*conds))


def ist_day_start_utc(now: datetime | None = None) -> datetime:
    ts = (now or datetime.now(timezone.utc)).astimezone(IST)
    return ts.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


async def uncovered_claimed_leads(
    session: AsyncSession,
    user_id: int,
    *,
    now: datetime | None = None,
) -> list[Lead]:
    """Leads this member claimed on a previous day that are still untouched (``new_lead``)."""
    rows = await session.execute(
        select(Lead)
        .where(
            Lead.assigned_to_user_id == user_id,
            Lead.status == UNCOVERED_STATUS,
            Lead.deleted_at.is_(None),
            Lead.archived_at.is_(None),
            Lead.in_pool.is_(False),
            pool_claim_exists(user_id=user_id, before=ist_day_start_utc(now)),
        )
        .order_by(Lead.id.asc())
    )
    return list(rows.scalars().all())


def claim_blocked_message(count: int) -> str:
    noun = "lead" if count == 1 else "leads"
    return (
        f"Claim blocked: you have {count} fresh {noun} from earlier days that you haven't "
        "covered yet. Update their status on the Calling Board first, then claim again."
    )


async def ensure_claim_allowed(session: AsyncSession, user_id: int) -> None:
    uncovered = await uncovered_claimed_leads(session, user_id)
    if uncovered:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=claim_blocked_message(len(uncovered)),
        )
