"""Pending AS (Assistant Supervisor) process queue.

Converted leads whose FOREVER (FLP) invoice / CC processing is still pending — i.e.
no APPROVED ``LeadSale`` row exists yet. Uploading + approving the FOREVER invoice
(handled by the sale engine + OCR) is what moves a converted lead through the AS
process (CC → revenue → cheque rollups).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.models.lead_sale import LeadSale
from app.schemas.leads import LeadListResponse
from app.services.downline import lead_management_visible_to_leader_clause
from app.services.lead_payloads import build_lead_public_payloads
from app.services.lead_scope import lead_visibility_where

router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


@router.get("", response_model=LeadListResponse)
async def list_pending_as_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> LeadListResponse:
    """Converted leads still pending FOREVER-invoice / CC processing, scoped like ``GET /leads``.

    "Done" = an approved LeadSale that carries case_credits (the real FOREVER tax-invoice
    parsed via OCR). A Day-3 stage-payment proof also creates an approved LeadSale but with
    NULL case_credits, so it must NOT clear a lead from this queue — the CC invoice is still due.
    """
    cc_invoice_done = (
        select(LeadSale.id)
        .where(
            LeadSale.lead_id == Lead.id,
            LeadSale.status == "approved",
            LeadSale.case_credits.is_not(None),
            LeadSale.case_credits > 0,
        )
        .exists()
    )
    parts = [
        Lead.status == "converted",
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
        ~cc_invoice_done,
    ]
    vis = (
        lead_management_visible_to_leader_clause(user.user_id)
        if user.role == "leader"
        else lead_visibility_where(user)
    )
    if vis is not None:
        parts.append(vis)
    cond = and_(*parts)

    total = int((await session.execute(select(func.count()).select_from(Lead).where(cond))).scalar_one())
    rows = (
        await session.execute(
            select(Lead).where(cond).order_by(Lead.day3_completed_at.desc().nullslast(), Lead.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    items = await build_lead_public_payloads(session, rows)
    return LeadListResponse(items=items, total=total, limit=limit, offset=offset)
