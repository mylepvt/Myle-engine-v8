from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.landing_inquiry import LandingInquiry
from app.schemas.landing_inquiry import LandingInquiryCreate, LandingInquiryResponse

router = APIRouter()

ADMIN_KEY_ENV = "LANDING_INQUIRY_ADMIN_KEY"


def _get_admin_key() -> str:
    return os.environ.get(ADMIN_KEY_ENV, "")


@router.post("", response_model=dict)
async def submit_inquiry(
    body: LandingInquiryCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    inquiry = LandingInquiry(
        name=body.name,
        email=body.email,
        phone=body.phone,
        institution=body.institution,
        message=body.message,
    )
    session.add(inquiry)
    await session.commit()
    return {"ok": True, "message": "Inquiry submitted successfully"}


@router.get("", response_model=list[LandingInquiryResponse])
async def list_inquiries(
    session: Annotated[AsyncSession, Depends(get_db)],
    key: str = Query(default=""),
):
    admin_key = _get_admin_key()
    if not admin_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin key not configured on server",
        )
    if key != admin_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin key",
        )
    result = await session.execute(
        select(LandingInquiry).order_by(LandingInquiry.created_at.desc())
    )
    return result.scalars().all()
