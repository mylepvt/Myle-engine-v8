"""Public (no-auth) lead-capture endpoints — driven by a member's link token.

Mounted under ``/api/capture`` (NOT ``/api/v1``). The prospect opens the form at
``/c/{token}`` (served by the SPA fallback → React ``CaptureFormPage``); keeping the data
API under ``/api/...`` avoids the API intercepting that page navigation.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.capture import (
    PublicLeadSubmit,
    PublicLinkInfo,
    PublicSubmitResponse,
)
from app.services import capture_service as svc
from fastapi import HTTPException

router = APIRouter(prefix="/api/capture", tags=["capture-public"])


def _handle(exc: svc.CaptureError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/{token}", response_model=PublicLinkInfo, include_in_schema=False)
async def public_link_info(token: str, session: Annotated[AsyncSession, Depends(get_db)]):
    try:
        info = await svc.get_public_info(session, token)
    except svc.CaptureError as exc:
        raise _handle(exc)
    return PublicLinkInfo(**info)


@router.post("/{token}", response_model=PublicSubmitResponse, include_in_schema=False)
async def public_submit(
    token: str,
    body: PublicLeadSubmit,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        await svc.submit_public_lead(
            session,
            token,
            name=body.name,
            phone=body.phone,
            city=body.city,
            age=body.age,
        )
    except svc.CaptureError as exc:
        raise _handle(exc)
    return PublicSubmitResponse(ok=True)
