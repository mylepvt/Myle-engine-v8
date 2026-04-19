"""Admin/member invoice listing and bulk HTML export."""

from __future__ import annotations

import io
import zipfile
from datetime import date, datetime, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import IST
from app.models.invoice import Invoice
from app.models.user import User
from app.schemas.invoices import InvoiceBulkDownloadBody, InvoiceListItem, InvoiceListResponse
from app.services.invoice_html import render_invoice_html

router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50
_MAX_BULK = 1500


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _display_name(u: User) -> str:
    return (u.name or u.username or u.email or f"User #{u.id}").strip()


def _parse_ist_day_bounds(
    date_from: Optional[str], date_to: Optional[str]
) -> tuple[Optional[datetime], Optional[datetime]]:
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    if date_from and date_from.strip():
        d = date.fromisoformat(date_from.strip())
        start = datetime.combine(d, time.min, tzinfo=IST)
    if date_to and date_to.strip():
        d = date.fromisoformat(date_to.strip())
        end = datetime.combine(d, time.max.replace(microsecond=999999), tzinfo=IST)
    return start, end


async def _invoice_query(
    session: AsyncSession,
    *,
    user_id_filter: Optional[int],
    date_from: Optional[str],
    date_to: Optional[str],
    doc_type: Optional[str],
    username_q: Optional[str],
    limit: int,
    offset: int,
) -> tuple[list[tuple[Invoice, User]], int]:
    start, end = _parse_ist_day_bounds(date_from, date_to)
    stmt = select(Invoice, User).join(User, Invoice.user_id == User.id)
    count_stmt = select(func.count()).select_from(Invoice).join(User, Invoice.user_id == User.id)

    if user_id_filter is not None:
        stmt = stmt.where(Invoice.user_id == user_id_filter)
        count_stmt = count_stmt.where(Invoice.user_id == user_id_filter)
    if start is not None:
        stmt = stmt.where(Invoice.issued_at >= start)
        count_stmt = count_stmt.where(Invoice.issued_at >= start)
    if end is not None:
        stmt = stmt.where(Invoice.issued_at <= end)
        count_stmt = count_stmt.where(Invoice.issued_at <= end)
    if doc_type and doc_type != "all":
        stmt = stmt.where(Invoice.doc_type == doc_type)
        count_stmt = count_stmt.where(Invoice.doc_type == doc_type)
    if username_q and username_q.strip():
        uq = f"%{username_q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.username).like(uq),
                func.lower(User.fbo_id).like(uq),
                func.lower(User.email).like(uq),
            )
        )
        count_stmt = count_stmt.where(
            or_(
                func.lower(User.username).like(uq),
                func.lower(User.fbo_id).like(uq),
                func.lower(User.email).like(uq),
            )
        )

    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = stmt.order_by(Invoice.issued_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    return [(inv, u) for inv, u in rows], total


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user_id: Optional[int] = Query(default=None, ge=1, description="Admin: filter member"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    doc_type: Optional[str] = Query(default=None, description="all | tax_invoice | payment_receipt"),
    q: Optional[str] = Query(default=None, max_length=120, description="Search username / email / fbo"),
) -> InvoiceListResponse:
    uid: Optional[int] = user.user_id
    if user.role == "admin":
        uid = user_id if user_id is not None else None
    else:
        if user_id is not None and user_id != user.user_id:
            _require_admin(user)
        uid = user.user_id

    dtype = doc_type or "all"
    rows, total = await _invoice_query(
        session,
        user_id_filter=uid,
        date_from=date_from,
        date_to=date_to,
        doc_type=dtype,
        username_q=q,
        limit=limit,
        offset=offset,
    )
    items = [
        InvoiceListItem(
            invoice_number=inv.invoice_number,
            doc_type=inv.doc_type,  # type: ignore[arg-type]
            user_id=inv.user_id,
            member_name=_display_name(mem),
            member_username=mem.username,
            total_cents=inv.total_cents,
            currency=inv.currency,
            issued_at=inv.issued_at,
        )
        for inv, mem in rows
    ]
    return InvoiceListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/invoices/bulk-download")
async def bulk_download_invoices(
    body: InvoiceBulkDownloadBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    _require_admin(user)
    dtype = body.doc_type or "all"
    rows, total = await _invoice_query(
        session,
        user_id_filter=None,
        date_from=body.date_from,
        date_to=body.date_to,
        doc_type=dtype,
        username_q=body.username,
        limit=_MAX_BULK,
        offset=0,
    )
    if total > _MAX_BULK:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Too many invoices ({total}); narrow filters (max {_MAX_BULK}).",
        )

    buf = io.BytesIO()
    combined_parts: list[str] = []
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for inv, mem in rows:
            html_doc = render_invoice_html(invoice=inv, member=mem)
            suffix = "invoice" if inv.doc_type == "tax_invoice" else "receipt"
            fname = f"{inv.invoice_number}-{suffix}.html"
            zf.writestr(fname, html_doc.encode("utf-8"))
            combined_parts.append(
                f'<div class="docwrap">{html_doc}</div>'
                '<div style="page-break-after:always"></div>'
            )
        combined = (
            "<!DOCTYPE html><html><head><meta charset='utf-8'><title>All invoices</title>"
            "<style>.docwrap { page-break-inside: avoid; margin-bottom: 2rem; }</style></head><body>"
            + "".join(combined_parts)
            + "</body></html>"
        )
        zf.writestr("all-invoices.html", combined.encode("utf-8"))

    data = buf.getvalue()
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="myle-invoices.zip"',
        },
    )
