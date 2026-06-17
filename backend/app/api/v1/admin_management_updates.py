"""API endpoints for WhatsApp management updates (to Shikha / configured phone)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.whatsapp_management_updates import (
    get_management_phone,
    send_daily_management_bundle,
    send_management_update,
    set_management_phone,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class ManagementSendResponse(BaseModel):
    ok: bool
    label: str = ""
    info: str = ""
    error: str = ""
    sent: bool = False


@router.post("/whatsapp/management-update", response_model=ManagementSendResponse)
async def trigger_management_update(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    type: str = Query(default="daily", description="daily | integrity | inactive | elite_alert | weekly | bundle"),
    phone: str = Query(default="", description="Override phone (optional)"),
) -> ManagementSendResponse:
    """Send a management WhatsApp update (top performers, integrity, etc.)."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    try:
        if type == "bundle":
            target_phone = phone.strip() or None
            results = await send_daily_management_bundle(session, target_phone)
            sent_count = sum(1 for r in results if r.get("sent"))
            return ManagementSendResponse(
                ok=True,
                label="Daily Bundle",
                info=f"Sent {sent_count}/{len(results)} updates",
                sent=sent_count > 0,
            )

        target_phone = phone.strip() or None
        result = await send_management_update(session, type, target_phone)
        return ManagementSendResponse(
            ok=result.get("ok", False),
            label=result.get("label", type),
            info=result.get("info", ""),
            error=result.get("error", ""),
            sent=result.get("sent", False),
        )
    except Exception as e:
        logger.exception("management update failed")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


class ManagementConfigResponse(BaseModel):
    phone: str = ""


@router.get("/whatsapp/management-config", response_model=ManagementConfigResponse)
async def get_management_config(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ManagementConfigResponse:
    """Get configured management phone number."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    phone = await get_management_phone(session)
    return ManagementConfigResponse(phone=phone or "")


@router.post("/whatsapp/management-config", response_model=ManagementConfigResponse)
async def save_management_config(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    phone: str = Query(default="", description="Management phone number"),
) -> ManagementConfigResponse:
    """Save management phone number."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    await set_management_phone(session, phone)
    await session.commit()
    return ManagementConfigResponse(phone=phone)
