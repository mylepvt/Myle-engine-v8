"""Shared lead pool: unclaimed rows with ``in_pool`` set by an admin."""

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
    LeadPoolBatchPreviewResponse,
    LeadPoolClaimBatchRequest,
    LeadPoolClaimBatchResponse,
    LeadPoolDefaultsResponse,
    LeadPoolDefaultsUpdateRequest,
    LeadPoolImportResponse,
    LeadPublic,
)
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.lead_pool_defaults import (
    APP_KEY_LEAD_POOL_DEFAULT_PRICE_CENTS,
    get_default_pool_price_cents,
)
from app.services.lead_pool_import import parse_pool_xlsx_rows
from app.services.leads_service import LeadsService, get_leads_service
from app.services.push_service import send_push_to_roles_bg
from app.services.settings_service import SettingsService

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


@router.get("/defaults", response_model=LeadPoolDefaultsResponse)
async def get_lead_pool_defaults(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadPoolDefaultsResponse:
    _ = user
    cents = await get_default_pool_price_cents(session)
    return LeadPoolDefaultsResponse(default_pool_price_cents=cents)


@router.put("/defaults", response_model=LeadPoolDefaultsResponse)
async def put_lead_pool_defaults(
    body: LeadPoolDefaultsUpdateRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadPoolDefaultsResponse:
    _require_admin(user)
    svc = SettingsService(session)
    ok, msg = await svc.update_app_setting(
        APP_KEY_LEAD_POOL_DEFAULT_PRICE_CENTS,
        str(body.default_pool_price_cents),
        user.user_id,
    )
    if not ok:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg)
    await notify_topics("leads")
    return LeadPoolDefaultsResponse(default_pool_price_cents=body.default_pool_price_cents)


@router.get("", response_model=LeadListResponse)
async def list_lead_pool(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> LeadListResponse:
    """Admin-only list of leads currently available in the shared pool."""
    _require_admin(user)
    cond = and_(
        Lead.in_pool.is_(True),
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
    )

    count_q = select(func.count()).select_from(Lead).where(cond)
    total = int((await session.execute(count_q)).scalar_one())

    list_q = (
        select(Lead).where(cond).order_by(Lead.created_at.desc()).limit(limit).offset(offset)
    )
    rows = (await session.execute(list_q)).scalars().all()
    items = [LeadPublic.model_validate(r) for r in rows]
    return LeadListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/batch-preview", response_model=LeadPoolBatchPreviewResponse)
async def preview_lead_pool_batch(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
    count: int = Query(default=1, ge=1, le=50),
) -> LeadPoolBatchPreviewResponse:
    available_count, claim_count, total_price_cents = await service.preview_lead_pool_batch(
        count=count,
        user=user,
    )
    return LeadPoolBatchPreviewResponse(
        requested_count=count,
        claim_count=claim_count,
        available_count=available_count,
        total_price_cents=total_price_cents,
    )


@router.post("/claim", response_model=LeadPoolClaimBatchResponse)
async def claim_lead_pool_batch(
    body: LeadPoolClaimBatchRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> LeadPoolClaimBatchResponse:
    leads, total_price_cents = await service.claim_lead_pool_batch(
        count=body.count,
        user=user,
    )
    return LeadPoolClaimBatchResponse(
        leads=[LeadPublic.model_validate(lead) for lead in leads],
        total_price_cents=total_price_cents,
    )


_MAX_IMPORT_BYTES = 12 * 1024 * 1024


@router.post("/import", response_model=LeadPoolImportResponse)
async def import_lead_pool_xlsx(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Excel .xlsx with headers (Full Name required)"),
) -> LeadPoolImportResponse:
    """Admin: bulk-add rows to the shared pool from an Excel file.

    Expected columns (flexible header text): Submit Time, Full Name, Age, Gender,
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

    default_cents = await get_default_pool_price_cents(session)
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
            pool_price_cents=default_cents if default_cents > 0 else None,
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
            action="lead.pool_import",
            entity_type="lead_pool",
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
        title="Lead Pool Updated",
        body="New leads are available in the lead pool. Claim your leads now!",
        url="/dashboard/work/lead-pool",
    )
    return LeadPoolImportResponse(created=created, warnings=warnings)
