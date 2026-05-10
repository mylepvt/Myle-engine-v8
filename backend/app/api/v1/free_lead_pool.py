"""Free lead pool — admin adds leads at zero cost; any eligible role can claim without wallet debit."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.db.session import AsyncSessionLocal
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.schemas.leads import (
    LeadListResponse,
    LeadPoolClaimBatchRequest,
    LeadPoolImportResponse,
)
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.lead_pool_import import parse_pool_xlsx_rows
from app.services.lead_payloads import build_lead_public_payloads
from app.services.leads_service import LeadsService, get_leads_service
from app.services.push_service import send_push_to_roles_bg
from pydantic import BaseModel, Field

router = APIRouter()


class FreeLeadPoolBatchPreviewResponse(BaseModel):
    requested_count: int = Field(ge=1, le=50)
    claim_count: int = Field(ge=0, le=50)
    available_count: int = Field(ge=0)


class FreeLeadPoolClaimBatchResponse(BaseModel):
    leads: list
    claimed_count: int


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50
_MAX_IMPORT_BYTES = 12 * 1024 * 1024

_FREE_POOL_CLAIM_ROLES: frozenset[str] = frozenset({"team", "leader", "admin"})


def _free_pool_cond():
    return and_(
        Lead.in_pool.is_(True),
        Lead.pool_type == "free",
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
    )


@router.get("", response_model=LeadListResponse)
async def list_free_lead_pool(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> LeadListResponse:
    """Admin-only detailed listing of leads in the free pool."""
    _require_admin(user)
    cond = _free_pool_cond()
    total = int((await session.execute(select(func.count()).select_from(Lead).where(cond))).scalar_one())
    list_q = (
        select(Lead).where(cond).order_by(Lead.created_at.desc()).limit(limit).offset(offset)
    )
    rows = (await session.execute(list_q)).scalars().all()
    items = await build_lead_public_payloads(session, rows)
    return LeadListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/batch-preview", response_model=FreeLeadPoolBatchPreviewResponse)
async def preview_free_pool_batch(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
    count: int = Query(default=1, ge=1, le=50),
) -> FreeLeadPoolBatchPreviewResponse:
    available_count, claim_count = await service.preview_free_lead_pool_batch(
        count=count,
        user=user,
    )
    return FreeLeadPoolBatchPreviewResponse(
        requested_count=count,
        claim_count=claim_count,
        available_count=available_count,
    )


@router.post("/claim", response_model=FreeLeadPoolClaimBatchResponse)
async def claim_free_pool_batch(
    body: LeadPoolClaimBatchRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> FreeLeadPoolClaimBatchResponse:
    leads = await service.claim_free_lead_pool_batch(
        count=body.count,
        user=user,
    )
    serialized = await service.serialize_lead_public_list(leads)
    return FreeLeadPoolClaimBatchResponse(
        leads=[l.model_dump() for l in serialized],
        claimed_count=len(leads),
    )


@router.post("/import", response_model=LeadPoolImportResponse)
async def import_free_lead_pool_xlsx(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Excel .xlsx with headers (Full Name required)"),
) -> LeadPoolImportResponse:
    """Admin: bulk-add rows to the FREE pool from Excel — no price, no wallet debit on claim.

    Same column format as paid pool: Submit Time, Full Name, Age, Gender,
    Phone Number (Calling Number), Your City Name, AD Name.
    """
    _require_admin(user)
    content = await file.read()
    if len(content) > _MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large (max 12 MB)",
        )
    if not content:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Empty file")

    rows, warnings = parse_pool_xlsx_rows(content)
    if not rows:
        return LeadPoolImportResponse(created=0, warnings=warnings or ["No rows imported"])

    created = 0
    for r in rows:
        st = r.get("submit_time")
        lead = Lead(
            name=r["name"],
            status="new_lead",
            created_by_user_id=user.user_id,
            assigned_to_user_id=None,
            phone=r.get("phone"),
            city=r.get("city"),
            age=r.get("age"),
            gender=r.get("gender"),
            ad_name=r.get("ad_name"),
            source="other",
            notes=None,
            in_pool=True,
            pool_price_cents=None,
            pool_type="free",
        )
        if st is not None:
            lead.created_at = st
        session.add(lead)
        await session.flush()
        enqueue_lead_shadow_upsert(session, lead)
        created += 1

    session.add(
        ActivityLog(
            user_id=user.user_id,
            action="lead.free_pool_import",
            entity_type="free_lead_pool",
            entity_id=None,
            meta={"created": created, "filename": file.filename},
        )
    )
    await session.commit()
    await notify_topics("leads")
    background_tasks.add_task(
        send_push_to_roles_bg,
        AsyncSessionLocal,
        ("leader", "team"),
        title="Free Lead Pool Updated",
        body="New free leads are available! Claim now — no wallet balance needed.",
        url="/dashboard/work/lead-pool",
    )
    return LeadPoolImportResponse(created=created, warnings=warnings)
