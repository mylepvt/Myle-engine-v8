"""Enrollment video share link endpoints.

Authenticated routes (prefix /enroll):
  POST /enroll/generate          — create a share link for a lead
  GET  /enroll/lead/{lead_id}    — list all share links for a lead

Public routes (no prefix — registered via watch_router):
  GET  /watch/{token}            — record view + return watch page data (no auth)
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.schemas.enroll import (
    EnrollShareLinkCreate,
    EnrollShareLinkListResponse,
    EnrollShareLinkPublic,
    WatchPageData,
)
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.lead_scope import lead_visibility_where

router = APIRouter()
watch_router = APIRouter()

# Lead statuses ordered by progression — used to avoid regressing status
_VIDEO_SENT_STATUS = "video_sent"
_VIDEO_WATCHED_STATUS = "video_watched"

# Statuses considered "past" video_sent — don't regress them
_PAST_VIDEO_SENT = {
    "video_watched",
    "paid",
    "mindset_lock",
    "day1",
    "day2",
    "day3",
    "interview",
    "track_selected",
    "seat_hold",
    "converted",
    "lost",
    "inactive",
}


async def _get_lead_or_404(session: AsyncSession, lead_id: int) -> Lead:
    lead = await session.get(Lead, lead_id)
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


def _assert_lead_access(user: AuthUser, lead: Lead) -> None:
    vis = lead_visibility_where(user)
    if vis is not None:
        if lead.created_by_user_id != user.user_id and lead.assigned_to_user_id != user.user_id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


# ---------------------------------------------------------------------------
# POST /enroll/generate
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=EnrollShareLinkPublic, status_code=http_status.HTTP_201_CREATED)
async def generate_share_link(
    body: EnrollShareLinkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollShareLinkPublic:
    """Create a unique share link for a lead's enrollment video."""
    lead = await _get_lead_or_404(session, body.lead_id)
    _assert_lead_access(user, lead)

    token = secrets.token_urlsafe(32)

    link = EnrollShareLink(
        token=token,
        lead_id=body.lead_id,
        created_by_user_id=user.user_id,
        youtube_url=body.youtube_url,
        title=body.title or "Watch this important video",
    )
    session.add(link)

    # Advance lead status to video_sent if not already past that stage
    should_sync_lead = False
    if lead.status not in _PAST_VIDEO_SENT and lead.status != _VIDEO_SENT_STATUS:
        lead.status = _VIDEO_SENT_STATUS
        should_sync_lead = True

    await session.flush()
    if should_sync_lead:
        enqueue_lead_shadow_upsert(session, lead)
    await session.commit()
    await session.refresh(link)
    return EnrollShareLinkPublic.model_validate(link)


# ---------------------------------------------------------------------------
# GET /enroll/lead/{lead_id}
# ---------------------------------------------------------------------------

@router.get("/lead/{lead_id}", response_model=EnrollShareLinkListResponse)
async def list_lead_share_links(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollShareLinkListResponse:
    """Return all share links for a lead (most recent first)."""
    lead = await _get_lead_or_404(session, lead_id)
    _assert_lead_access(user, lead)

    count_stmt = (
        select(func.count())
        .select_from(EnrollShareLink)
        .where(EnrollShareLink.lead_id == lead_id)
    )
    total = int((await session.execute(count_stmt)).scalar_one())

    list_stmt = (
        select(EnrollShareLink)
        .where(EnrollShareLink.lead_id == lead_id)
        .order_by(EnrollShareLink.created_at.desc())
    )
    rows = (await session.execute(list_stmt)).scalars().all()
    items = [EnrollShareLinkPublic.model_validate(r) for r in rows]
    return EnrollShareLinkListResponse(items=items, total=total)


# ---------------------------------------------------------------------------
# GET /watch/{token}  — PUBLIC, no auth
# ---------------------------------------------------------------------------

@watch_router.get("/watch/{token}", response_model=WatchPageData)
async def watch_video(
    token: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchPageData:
    """Public endpoint. Increments view count and auto-updates lead status."""
    stmt = select(EnrollShareLink).where(EnrollShareLink.token == token)
    result = await session.execute(stmt)
    link = result.scalar_one_or_none()

    if link is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Link not found")

    lead = await session.get(Lead, link.lead_id)
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Link not found")

    now = datetime.now(timezone.utc)

    # Increment view tracking
    link.view_count = (link.view_count or 0) + 1
    if link.first_viewed_at is None:
        link.first_viewed_at = now
    link.last_viewed_at = now

    # Auto-update lead status once
    should_sync_lead = False
    if not link.status_synced:
        lead.status = _VIDEO_WATCHED_STATUS
        link.status_synced = True
        should_sync_lead = True

    await session.flush()
    if should_sync_lead:
        enqueue_lead_shadow_upsert(session, lead)
    await session.commit()
    await session.refresh(link)

    lead_first_name = (lead.name or "").split()[0] if lead.name else "there"

    return WatchPageData(
        token=link.token,
        title=link.title or "Watch this important video",
        youtube_url=link.youtube_url,
        lead_name=lead_first_name,
        view_count=link.view_count,
    )
