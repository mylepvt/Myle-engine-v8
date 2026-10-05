"""Public (no-auth) certificate verification — the target of the QR code on certificates.

Mounted under ``/api/public`` (not ``/api/v1``); the browser page lives at ``/verify``
(SPA route) and calls this endpoint.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.certificate_verify import verify_certificate

router = APIRouter(prefix="/api/public/certificates", tags=["certificate-verify"])


@router.get("/verify")
async def verify(
    session: Annotated[AsyncSession, Depends(get_db)],
    no: str = Query(..., max_length=64, description="Certificate number, e.g. MYLE/TRN/2026/00003"),
    c: str = Query(..., max_length=16, description="Verification code printed on the certificate"),
) -> dict:
    result = await verify_certificate(session, no, c)
    return {"valid": result is not None, "certificate": result}
