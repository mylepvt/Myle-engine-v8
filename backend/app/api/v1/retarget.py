"""Leads eligible for retargeting (non-archived, status lost/contacted/inactive/retarget)."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.services.downline import lead_management_visible_to_leader_clause
from app.schemas.leads import LeadListResponse
from app.services.lead_payloads import build_lead_public_payloads
from app.services.lead_scope import lead_visibility_where

router = APIRouter()

_RETARGET_STATUSES = ("lost", "contacted", "inactive", "retarget")
_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50
# Re-highlight a retargeted lead to its owner one month after it went lost/retarget.
_REHIGHLIGHT_AFTER = timedelta(days=30)


@router.get("", response_model=LeadListResponse)
async def list_retarget_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    ready_only: bool = Query(
        default=False,
        description="Only leads whose 1-month re-highlight is due (retarget_at older than 30 days).",
    ),
) -> LeadListResponse:
    """Scoped like ``GET /leads`` — only rows in retarget-worthy statuses and not archived.

    With ``ready_only=true`` this returns the owner's re-highlight queue: leads that
    entered lost/retarget at least a month ago, oldest first, so the owner can re-engage
    with the full prior context (notes / call_status carried on the lead payload).
    """
    parts = [
        Lead.status.in_(_RETARGET_STATUSES),
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    ]
    vis = (
        lead_management_visible_to_leader_clause(user.user_id)
        if user.role == "leader"
        else lead_visibility_where(user)
    )
    if vis is not None:
        parts.append(vis)
    if ready_only:
        cutoff = datetime.now(timezone.utc) - _REHIGHLIGHT_AFTER
        parts.append(Lead.retarget_at.is_not(None))
        parts.append(Lead.retarget_at <= cutoff)
    cond = and_(*parts)

    count_q = select(func.count()).select_from(Lead).where(cond)
    total = int((await session.execute(count_q)).scalar_one())

    # Re-highlight queue surfaces the most-overdue first; default browse stays newest-first.
    order = Lead.retarget_at.asc() if ready_only else Lead.created_at.desc()
    list_q = (
        select(Lead).where(cond).order_by(order).limit(limit).offset(offset)
    )
    rows = (await session.execute(list_q)).scalars().all()
    items = await build_lead_public_payloads(session, rows)
    return LeadListResponse(items=items, total=total, limit=limit, offset=offset)
