"""Enrollment video share-link endpoints."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status
from starlette.background import BackgroundTask

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.schemas.enroll import (
    EnrollShareLinkCreate,
    EnrollShareLinkListResponse,
    EnrollShareLinkPublic,
    EnrollmentVideoSendDelivery,
    EnrollmentVideoSendResponse,
    WatchEventResponse,
    WatchPageData,
    WatchUnlockRequest,
)
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.enrollment_video import (
    absolute_video_source_url,
    clear_watch_cookie,
    enrollment_expires_at,
    ensure_utc_datetime,
    expire_active_links_for_lead,
    get_enrollment_video_title,
    has_watch_access,
    issue_watch_cookie,
    is_youtube_like_url,
    mask_phone,
    normalize_phone_for_match,
    require_secure_enrollment_video_source,
    resolve_public_app_url,
    sanitize_public_token,
)
from app.services.lead_scope import user_can_mutate_lead
from app.services.whatsapp_enrollment import send_enrollment_video_whatsapp

router = APIRouter()
watch_router = APIRouter()

_VIDEO_SENT_STATUS = "video_sent"
_VIDEO_WATCHED_STATUS = "video_watched"
_POST_VIDEO_SENT_STATUSES = {
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
_POST_WATCH_STATUSES = {
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
_POST_SENT_CALL_STATUSES = {"video_watched", "payment_done"}
_POST_WATCH_CALL_STATUSES = {"payment_done"}


async def _get_lead_or_404(session: AsyncSession, lead_id: int) -> Lead:
    lead = await session.get(Lead, lead_id)
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


async def _assert_lead_access(session: AsyncSession, user: AuthUser, lead: Lead) -> None:
    if not await user_can_mutate_lead(session, user, lead):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _build_public_link(link: EnrollShareLink) -> EnrollShareLinkPublic:
    return EnrollShareLinkPublic.model_validate(link)


def _sync_lead_for_send(lead: Lead, *, now: datetime) -> bool:
    previous_status = lead.status
    if lead.status not in _POST_VIDEO_SENT_STATUSES and lead.status != _VIDEO_SENT_STATUS:
        lead.status = _VIDEO_SENT_STATUS
    if (lead.call_status or "").strip() not in _POST_SENT_CALL_STATUSES:
        lead.call_status = _VIDEO_SENT_STATUS
    lead.whatsapp_sent_at = now
    if lead.status != previous_status:
        lead.last_action_at = now
    return lead.status != previous_status


def _sync_lead_for_watch(lead: Lead, *, now: datetime) -> bool:
    previous_status = lead.status
    if lead.status not in _POST_WATCH_STATUSES and lead.status != _VIDEO_WATCHED_STATUS:
        lead.status = _VIDEO_WATCHED_STATUS
    if (lead.call_status or "").strip() not in _POST_WATCH_CALL_STATUSES:
        lead.call_status = _VIDEO_WATCHED_STATUS
    if lead.status != previous_status:
        lead.last_action_at = now
    return lead.status != previous_status


async def _prepare_share_link(
    *,
    session: AsyncSession,
    lead: Lead,
    user: AuthUser,
    now: datetime,
) -> EnrollShareLink:
    source_url = await require_secure_enrollment_video_source(session)
    title = await get_enrollment_video_title(session)
    await expire_active_links_for_lead(session, lead_id=lead.id, now=now)
    link = EnrollShareLink(
        token=secrets.token_urlsafe(32),
        lead_id=lead.id,
        created_by_user_id=user.user_id,
        youtube_url=source_url,
        title=title,
        expires_at=enrollment_expires_at(now),
    )
    session.add(link)
    return link


async def _get_watch_link_and_lead(
    session: AsyncSession,
    token: str,
) -> tuple[EnrollShareLink, Lead]:
    clean_token = sanitize_public_token(token)
    if not clean_token:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Link not found")
    link = (
        await session.execute(select(EnrollShareLink).where(EnrollShareLink.token == clean_token))
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Link not found")
    if ensure_utc_datetime(link.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="This private video link has expired.")
    lead = await session.get(Lead, link.lead_id)
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Link not found")
    return link, lead


def _watch_page_payload(
    *,
    link: EnrollShareLink,
    lead: Lead,
    access_granted: bool,
) -> WatchPageData:
    lead_first_name = (lead.name or "").split()[0] if lead.name else "there"
    return WatchPageData(
        token=link.token,
        title=link.title or "Enrollment video",
        lead_name=lead_first_name,
        masked_phone=mask_phone(lead.phone),
        expires_at=link.expires_at,
        access_granted=access_granted,
        stream_url=f"/api/v1/watch/{link.token}/stream" if access_granted else None,
        watch_started=link.first_viewed_at is not None,
        watch_completed=bool(link.status_synced),
    )


async def _close_upstream(upstream: httpx.Response, client: httpx.AsyncClient) -> None:
    await upstream.aclose()
    await client.aclose()


@router.post("/generate", response_model=EnrollShareLinkPublic, status_code=http_status.HTTP_201_CREATED)
async def generate_share_link(
    body: EnrollShareLinkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollShareLinkPublic:
    """Create a secure share link without attempting WhatsApp delivery."""
    lead = await _get_lead_or_404(session, body.lead_id)
    await _assert_lead_access(session, user, lead)
    if normalize_phone_for_match(lead.phone) is None:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead phone number is required.")

    now = datetime.now(timezone.utc)
    link = await _prepare_share_link(session=session, lead=lead, user=user, now=now)
    should_sync_lead = _sync_lead_for_send(lead, now=now)

    await session.flush()
    if should_sync_lead:
        enqueue_lead_shadow_upsert(session, lead)
    await session.commit()
    await session.refresh(link)
    return _build_public_link(link)


@router.post("/send", response_model=EnrollmentVideoSendResponse, status_code=http_status.HTTP_201_CREATED)
async def send_enrollment_video(
    body: EnrollShareLinkCreate,
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentVideoSendResponse:
    """Create a secure link, send it over WhatsApp, and move the lead to video_sent."""
    lead = await _get_lead_or_404(session, body.lead_id)
    await _assert_lead_access(session, user, lead)
    if normalize_phone_for_match(lead.phone) is None:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead phone number is required.")

    now = datetime.now(timezone.utc)
    link = await _prepare_share_link(session=session, lead=lead, user=user, now=now)
    public_app_url = await resolve_public_app_url(session, request)
    watch_url = f"{public_app_url}/watch/{link.token}"

    delivery_meta = await send_enrollment_video_whatsapp(
        lead_id=lead.id,
        phone=lead.phone,
        lead_name=lead.name,
        watch_url=watch_url,
        expires_at=link.expires_at,
        title=link.title or "Enrollment video",
    )
    if not delivery_meta.get("ok") and delivery_meta.get("channel") != "whatsapp_stub":
        await session.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp delivery failed, so lead status was not changed.",
        )

    should_sync_lead = _sync_lead_for_send(lead, now=now)
    await session.flush()
    if should_sync_lead:
        enqueue_lead_shadow_upsert(session, lead)
    await session.commit()
    await session.refresh(link)

    return EnrollmentVideoSendResponse(
        link=_build_public_link(link),
        delivery=EnrollmentVideoSendDelivery.model_validate(delivery_meta),
    )


@router.get("/lead/{lead_id}", response_model=EnrollShareLinkListResponse)
async def list_lead_share_links(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollShareLinkListResponse:
    lead = await _get_lead_or_404(session, lead_id)
    await _assert_lead_access(session, user, lead)

    total = int(
        (
            await session.execute(
                select(func.count()).select_from(EnrollShareLink).where(EnrollShareLink.lead_id == lead_id)
            )
        ).scalar_one()
    )
    rows = (
        await session.execute(
            select(EnrollShareLink)
            .where(EnrollShareLink.lead_id == lead_id)
            .order_by(EnrollShareLink.created_at.desc())
        )
    ).scalars().all()
    return EnrollShareLinkListResponse(items=[_build_public_link(row) for row in rows], total=total)


@watch_router.get("/watch/{token}", response_model=WatchPageData)
async def watch_video(
    token: str,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchPageData:
    try:
        link, lead = await _get_watch_link_and_lead(session, token)
    except HTTPException:
        clear_watch_cookie(response)
        raise
    access_granted = has_watch_access(request, link=link, lead=lead)
    if not access_granted:
        clear_watch_cookie(response)
    return _watch_page_payload(link=link, lead=lead, access_granted=access_granted)


@watch_router.post("/watch/{token}/unlock", response_model=WatchPageData)
async def unlock_watch_video(
    token: str,
    body: WatchUnlockRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchPageData:
    link, lead = await _get_watch_link_and_lead(session, token)
    expected_phone = normalize_phone_for_match(lead.phone)
    provided_phone = normalize_phone_for_match(body.phone)
    if expected_phone is None or provided_phone != expected_phone:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Use the same number that is registered on this lead.",
        )
    issue_watch_cookie(response, token=link.token, lead=lead, expires_at=link.expires_at)
    return _watch_page_payload(link=link, lead=lead, access_granted=True)


@watch_router.post("/watch/{token}/play", response_model=WatchEventResponse)
async def mark_watch_started(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchEventResponse:
    link, lead = await _get_watch_link_and_lead(session, token)
    if not has_watch_access(request, link=link, lead=lead):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Verify your number to continue.")

    now = datetime.now(timezone.utc)

    if link.first_viewed_at is None:
        link.first_viewed_at = now
        link.view_count = int(link.view_count or 0) + 1
    link.last_viewed_at = now

    await session.commit()
    return WatchEventResponse(ok=True, watch_started=True, watch_completed=bool(link.status_synced))


@watch_router.post("/watch/{token}/complete", response_model=WatchEventResponse)
async def mark_watch_completed(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchEventResponse:
    link, lead = await _get_watch_link_and_lead(session, token)
    if not has_watch_access(request, link=link, lead=lead):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Verify your number to continue.")

    now = datetime.now(timezone.utc)
    should_sync_lead = False

    if link.first_viewed_at is None:
        link.first_viewed_at = now
        link.view_count = int(link.view_count or 0) + 1
    link.last_viewed_at = now
    if not link.status_synced:
        should_sync_lead = _sync_lead_for_watch(lead, now=now)
        link.status_synced = True

    await session.flush()
    if should_sync_lead:
        enqueue_lead_shadow_upsert(session, lead)
    await session.commit()
    return WatchEventResponse(ok=True, watch_started=True, watch_completed=True)


@watch_router.get("/watch/{token}/stream")
async def stream_watch_video(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    link, lead = await _get_watch_link_and_lead(session, token)
    if not has_watch_access(request, link=link, lead=lead):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Verify your number to continue.")

    source_url = (link.youtube_url or "").strip()
    if not source_url:
        source_url = await require_secure_enrollment_video_source(session)
    if is_youtube_like_url(source_url):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Enrollment video source must be a direct hosted video URL.",
        )

    upstream_url = absolute_video_source_url(request, source_url)
    forward_headers: dict[str, str] = {}
    if request.headers.get("range"):
        forward_headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(60.0, connect=10.0))
    upstream = await client.send(client.build_request("GET", upstream_url, headers=forward_headers), stream=True)
    if upstream.status_code not in {200, 206}:
        await _close_upstream(upstream, client)
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video file is not available.")

    headers = {"Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="myle-enrollment-video"'}
    for key in ("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"):
        value = upstream.headers.get(key)
        if value:
            headers[key] = value

    return StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "video/mp4"),
        headers=headers,
        background=BackgroundTask(_close_upstream, upstream, client),
    )
