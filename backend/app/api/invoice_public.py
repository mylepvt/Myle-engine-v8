"""Cookie-authenticated HTML invoice download (not under /api/v1)."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.invoice import Invoice
from app.services.invoice_html import render_invoice_html
from app.services.invoice_records import load_member_for_invoice

router = APIRouter()

_INV_NUM_RE = re.compile(r"^MYL-\d{4}-\d{4,}$")


@router.get("/invoice/{invoice_number}/download", response_class=HTMLResponse, include_in_schema=False)
async def download_invoice_html(
    invoice_number: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> HTMLResponse:
    invn = invoice_number.strip()
    if not _INV_NUM_RE.match(invn):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    row = await session.execute(select(Invoice).where(Invoice.invoice_number == invn))
    inv = row.scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    if user.role != "admin" and inv.user_id != user.user_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
    member = await load_member_for_invoice(session, inv.user_id)
    if member is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    html = render_invoice_html(invoice=inv, member=member)
    return HTMLResponse(content=html)
