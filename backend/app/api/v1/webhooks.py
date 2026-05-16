"""Inbound webhooks — WhatsApp reply ingestion and outreach admin API."""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.config import settings
from app.models.member_removal_outreach import MemberRemovalOutreach
from app.services.whatsapp_removal import record_reply

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Inbound reply webhook (called by n8n / WhatsApp BSP)
# ---------------------------------------------------------------------------

class WhatsAppReplyPayload(BaseModel):
    phone: str
    message: str
    wa_message_id: Optional[str] = None


@router.post("/webhooks/whatsapp/reply", status_code=200)
async def receive_whatsapp_reply(
    payload: WhatsAppReplyPayload,
    session: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> dict:
    """
    Called by your WhatsApp automation (n8n / WATI / BSP) when a removed member replies.

    Authentication: set REMOVAL_WHATSAPP_REPLY_SECRET in env.
    Your automation must include: Authorization: Bearer <secret>

    Payload example:
    {
      "phone": "+919876543210",
      "message": "I was dealing with personal issues",
      "wa_message_id": "wamid.xxx"   (optional)
    }
    """
    secret = (getattr(settings, "removal_whatsapp_reply_secret", None) or "").strip()
    if secret:
        if not authorization or authorization != f"Bearer {secret}":
            raise HTTPException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook secret",
            )

    match = await record_reply(
        phone=payload.phone,
        reply_text=payload.message,
        wa_message_id=payload.wa_message_id,
        session=session,
    )
    if match is None:
        logger.info("whatsapp reply: no outreach record matched for phone")
        return {"ok": True, "matched": False}

    await session.commit()
    logger.info(
        "whatsapp reply stored outreach_id=%s user_id=%s",
        match.id,
        match.user_id,
    )
    return {"ok": True, "matched": True, "outreach_id": match.id}


# ---------------------------------------------------------------------------
# Admin: list outreach records + replies
# ---------------------------------------------------------------------------

class OutreachItem(BaseModel):
    id: int
    user_id: int
    phone: Optional[str]
    member_name: str
    removal_reason: Optional[str]
    send_status: str
    sent_at: Optional[str]
    manual_share_url: Optional[str]
    reply_text: Optional[str]
    replied_at: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class OutreachListResponse(BaseModel):
    items: list[OutreachItem]
    total: int


@router.get("/team/removal-outreach", response_model=OutreachListResponse)
async def list_removal_outreach(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    replied_only: bool = False,
) -> OutreachListResponse:
    """Admin: list all removal outreach records with member replies."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    stmt = select(MemberRemovalOutreach).order_by(MemberRemovalOutreach.created_at.desc())
    if replied_only:
        stmt = stmt.where(MemberRemovalOutreach.reply_text.isnot(None))

    rows = (await session.execute(stmt)).scalars().all()

    items = [
        OutreachItem(
            id=r.id,
            user_id=r.user_id,
            phone=r.phone,
            member_name=r.member_name,
            removal_reason=r.removal_reason,
            send_status=r.send_status,
            sent_at=r.sent_at.isoformat() if r.sent_at else None,
            manual_share_url=r.manual_share_url,
            reply_text=r.reply_text,
            replied_at=r.replied_at.isoformat() if r.replied_at else None,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
    return OutreachListResponse(items=items, total=len(items))
