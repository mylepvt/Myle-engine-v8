"""CC/sale billing endpoints (Phase 3).

Routes (registered without a prefix so paths read naturally):
- POST /leads/{lead_id}/sales         upload invoice → OCR → hybrid auto-verify
- GET  /leads/{lead_id}/sales         a lead's sale records
- GET  /sales/pending                 admin/leader approval queue
- POST /sales/{sale_id}/approve       admin
- POST /sales/{sale_id}/reject        admin
- GET  /sales/dashboard               role-scoped CC + revenue rollup
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.payment_validator import require_admin_role
from app.schemas.sales import (
    LeadSalePublic,
    SaleDashboardResponse,
    SaleListResponse,
    SaleManualFields,
    SaleRejectRequest,
    SaleSubmitResponse,
)
from app.services.sales_service import SalesService

router = APIRouter()


@router.post("/leads/{lead_id}/sales", response_model=SaleSubmitResponse)
async def submit_sale(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    billing_stage: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    case_credits: Annotated[Optional[Decimal], Form()] = None,
    amount_cents: Annotated[Optional[int], Form()] = None,
    cgst_cents: Annotated[Optional[int], Form()] = None,
    sgst_cents: Annotated[Optional[int], Form()] = None,
    invoice_number: Annotated[Optional[str], Form()] = None,
    fbo_id: Annotated[Optional[str], Form()] = None,
    sponsor_id: Annotated[Optional[str], Form()] = None,
    order_count: Annotated[Optional[int], Form()] = None,
    invoice_date: Annotated[Optional[date], Form()] = None,
) -> SaleSubmitResponse:
    manual = SaleManualFields(
        case_credits=case_credits,
        amount_cents=amount_cents,
        cgst_cents=cgst_cents,
        sgst_cents=sgst_cents,
        invoice_number=invoice_number,
        fbo_id=fbo_id,
        sponsor_id=sponsor_id,
        order_count=order_count,
        invoice_date=invoice_date,
    )
    svc = SalesService(session)
    ok, msg, sale, auto = await svc.submit_sale(
        lead_id=lead_id,
        billing_stage=billing_stage,
        file=file,
        manual=manual,
        actor_user_id=user.user_id,
        actor_role=user.role,
    )
    if not ok or sale is None:
        code = (
            http_status.HTTP_403_FORBIDDEN
            if msg == "Access denied"
            else http_status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return SaleSubmitResponse(
        sale=LeadSalePublic.model_validate(sale), auto_approved=auto, message=msg
    )


@router.get("/leads/{lead_id}/sales", response_model=SaleListResponse)
async def list_lead_sales(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SaleListResponse:
    svc = SalesService(session)
    from app.models.lead import Lead

    lead = await session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if not await svc._can_access_lead(
        lead, actor_user_id=user.user_id, actor_role=user.role
    ):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Access denied")
    rows = await svc.list_for_lead(lead_id)
    return SaleListResponse(
        items=[LeadSalePublic.model_validate(r) for r in rows], total=len(rows)
    )


@router.get("/sales/pending", response_model=SaleListResponse)
async def list_pending_sales(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SaleListResponse:
    svc = SalesService(session)
    rows = await svc.pending_queue(user_id=user.user_id, role=user.role)
    return SaleListResponse(
        items=[LeadSalePublic.model_validate(r) for r in rows], total=len(rows)
    )


@router.post("/sales/{sale_id}/approve", response_model=LeadSalePublic)
async def approve_sale(
    sale_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadSalePublic:
    require_admin_role(user)
    svc = SalesService(session)
    ok, msg, sale = await svc.approve_sale(sale_id=sale_id, admin_user_id=user.user_id)
    if not ok or sale is None:
        code = (
            http_status.HTTP_404_NOT_FOUND
            if msg == "Sale not found"
            else http_status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return LeadSalePublic.model_validate(sale)


@router.post("/sales/{sale_id}/reject", response_model=LeadSalePublic)
async def reject_sale(
    sale_id: int,
    body: SaleRejectRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadSalePublic:
    require_admin_role(user)
    svc = SalesService(session)
    ok, msg, sale = await svc.reject_sale(
        sale_id=sale_id, admin_user_id=user.user_id, reason=body.reason
    )
    if not ok or sale is None:
        code = (
            http_status.HTTP_404_NOT_FOUND
            if msg == "Sale not found"
            else http_status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return LeadSalePublic.model_validate(sale)


@router.get("/sales/dashboard", response_model=SaleDashboardResponse)
async def sales_dashboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SaleDashboardResponse:
    svc = SalesService(session)
    data = await svc.dashboard(user_id=user.user_id, role=user.role)
    return SaleDashboardResponse.model_validate(data)
