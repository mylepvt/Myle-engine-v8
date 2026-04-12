from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.lead_status import WORKBOARD_COLUMNS
from app.models.lead import Lead
from app.schemas.leads import LeadPublic
from app.schemas.workboard import WorkboardActionCounts, WorkboardColumnOut, WorkboardResponse
from app.services.lead_scope import lead_visibility_where

router = APIRouter()

_DEFAULT_PER_COLUMN = 40
_DEFAULT_MAX_ROWS = 300


@router.get("", response_model=WorkboardResponse)
async def get_workboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit_per_column: int = Query(
        default=_DEFAULT_PER_COLUMN,
        ge=1,
        le=80,
        description="Max cards returned per status column",
    ),
    max_rows: int = Query(
        default=_DEFAULT_MAX_ROWS,
        ge=50,
        le=500,
        description="Recent leads loaded before bucketing (newest first)",
    ),
) -> WorkboardResponse:
    """Pipeline-style view: leads grouped by ``status`` with the same visibility rules as ``GET /leads``."""
    vis = lead_visibility_where(user)

    active = and_(
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    )
    count_stmt = select(Lead.status, func.count()).group_by(Lead.status).where(active)
    if vis is not None:
        count_stmt = count_stmt.where(vis)
    count_result = await session.execute(count_stmt)
    totals: dict[str, int] = {row[0]: int(row[1]) for row in count_result.all()}

    list_stmt = select(Lead).where(active).order_by(Lead.created_at.desc()).limit(max_rows)
    if vis is not None:
        list_stmt = list_stmt.where(vis)
    rows = (await session.execute(list_stmt)).scalars().all()

    buckets: dict[str, list[LeadPublic]] = {s: [] for s in WORKBOARD_COLUMNS}
    for lead in rows:
        st = lead.status
        if st not in buckets:
            continue
        if len(buckets[st]) >= limit_per_column:
            continue
        buckets[st].append(LeadPublic.model_validate(lead))

    columns = [
        WorkboardColumnOut(status=s, total=totals.get(s, 0), items=buckets[s])
        for s in WORKBOARD_COLUMNS
    ]

    scope = and_(
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    )
    if vis is not None:
        scope = and_(scope, vis)

    pending_calls_q = select(func.count()).select_from(Lead).where(
        scope,
        or_(
            Lead.call_status.is_(None),
            Lead.call_status.in_(("not_called", "no_answer")),
        ),
    )
    videos_q = select(func.count()).select_from(Lead).where(
        scope,
        Lead.status.in_(("invited", "video_sent")),
    )
    pending_calls = int((await session.execute(pending_calls_q)).scalar_one())
    videos_to_send = int((await session.execute(videos_q)).scalar_one())

    return WorkboardResponse(
        columns=columns,
        max_rows_fetched=max_rows,
        action_counts=WorkboardActionCounts(
            pending_calls=pending_calls,
            videos_to_send=videos_to_send,
        ),
    )
