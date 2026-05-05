"""Enrollment video share-link endpoints."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status
from starlette.background import BackgroundTask

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.schemas.enroll import (
    ActiveWatcherListResponse,
    ActiveWatcherPublic,
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
    build_enrollment_stream_source_candidates,
    clear_watch_cookie,
    ensure_watch_timer_started,
    enrollment_expires_at,
    ensure_utc_datetime,
    expire_active_links_for_lead,
    get_app_setting,
    get_enrollment_video_source,
    get_enrollment_video_title,
    has_watch_access,
    issue_watch_cookie,
    is_youtube_like_url,
    mask_phone,
    normalize_video_source_url,
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
_LIVE_SESSION_SLOT_ORDER = (
    ("live_session_slot_11_00", "11:00 AM"),
    ("live_session_slot_12_00", "12:00 PM"),
    ("live_session_slot_13_00", "1:00 PM"),
    ("live_session_slot_14_00", "2:00 PM"),
    ("live_session_slot_15_00", "3:00 PM"),
    ("live_session_slot_16_00", "4:00 PM"),
    ("live_session_slot_17_00", "5:00 PM"),
    ("live_session_slot_18_00", "6:00 PM"),
    ("live_session_slot_19_00", "7:00 PM"),
    ("live_session_slot_20_00", "8:00 PM"),
    ("live_session_slot_21_00", "9:00 PM"),
)
_IST = ZoneInfo("Asia/Kolkata")
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
    lead.whatsapp_sent_at = now
    if lead.status != previous_status:
        lead.last_action_at = now
    return lead.status != previous_status


def _parse_non_negative_int(raw_value: str) -> int | None:
    value = (raw_value or "").strip()
    if not value:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return max(0, parsed)


async def _load_watch_room_snapshot(session: AsyncSession) -> dict[str, int | str | None]:
    social_proof_count = _parse_non_negative_int(
        await get_app_setting(session, "enrollment_social_proof_count")
    )
    total_seats = _parse_non_negative_int(await get_app_setting(session, "enrollment_total_seats"))
    seats_left = _parse_non_negative_int(await get_app_setting(session, "enrollment_seats_left"))
    trust_note = (await get_app_setting(session, "enrollment_trust_note")).strip() or None

    if total_seats is not None and seats_left is not None:
        seats_left = min(seats_left, total_seats)

    return {
        "social_proof_count": social_proof_count,
        "total_seats": total_seats,
        "seats_left": seats_left,
        "trust_note": trust_note,
    }


async def _prepare_share_link(
    *,
    session: AsyncSession,
    lead: Lead,
    user: AuthUser,
    now: datetime,
    source_url: str | None = None,
    title: str | None = None,
) -> EnrollShareLink:
    resolved_source_url = source_url or await require_secure_enrollment_video_source(session)
    resolved_title = title or await get_enrollment_video_title(session)
    await expire_active_links_for_lead(session, lead_id=lead.id, now=now)
    link = EnrollShareLink(
        token=secrets.token_urlsafe(32),
        lead_id=lead.id,
        created_by_user_id=user.user_id,
        youtube_url=resolved_source_url,
        title=resolved_title,
    )
    session.add(link)
    return link


def _slot_time_from_key(slot_key: str) -> tuple[int, int] | None:
    for key, _label in _LIVE_SESSION_SLOT_ORDER:
        if key != slot_key:
            continue
        suffix = key.removeprefix("live_session_slot_")
        hour_text, minute_text = suffix.split("_", 1)
        return int(hour_text), int(minute_text)
    return None


def _slot_label_from_key(slot_key: str) -> str | None:
    for key, label in _LIVE_SESSION_SLOT_ORDER:
        if key == slot_key:
            return label
    return None


async def _resolve_selected_live_session_source(
    session: AsyncSession,
    slot_key: str | None,
) -> tuple[str | None, str | None]:
    clean_key = (slot_key or "").strip()
    if not clean_key:
        return None, None
    slot_label = _slot_label_from_key(clean_key)
    if slot_label is None:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid live session slot")
    source_url = (await get_app_setting(session, clean_key)).strip()
    if not source_url:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=f"{slot_label} live session video is not configured.")
    normalized_source = normalize_video_source_url(source_url)
    if not normalized_source or is_youtube_like_url(normalized_source):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"{slot_label} live session video must be a direct hosted link, not YouTube.",
        )
    base_title = (await get_app_setting(session, "live_session_title")).strip() or "Live Session"
    return normalized_source, f"{base_title} • {slot_label}"


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
    expiry = ensure_utc_datetime(link.expires_at) if link.expires_at is not None else None
    if expiry is not None and expiry <= datetime.now(timezone.utc):
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
    room_snapshot: dict[str, int | str | None] | None = None,
) -> WatchPageData:
    lead_first_name = (lead.name or "").split()[0] if lead.name else "there"
    snapshot = room_snapshot or {}
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
        viewer_name=link.viewer_name,
        viewer_phone=link.viewer_phone,
        social_proof_count=snapshot.get("social_proof_count"),
        total_seats=snapshot.get("total_seats"),
        seats_left=snapshot.get("seats_left"),
        trust_note=snapshot.get("trust_note"),
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
    selected_source, selected_title = await _resolve_selected_live_session_source(session, body.live_session_slot_key)
    link = await _prepare_share_link(
        session=session,
        lead=lead,
        user=user,
        now=now,
        source_url=selected_source,
        title=selected_title,
    )
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
    selected_source, selected_title = await _resolve_selected_live_session_source(session, body.live_session_slot_key)
    link = await _prepare_share_link(
        session=session,
        lead=lead,
        user=user,
        now=now,
        source_url=selected_source,
        title=selected_title,
    )
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


@router.get("/live-watchers", response_model=ActiveWatcherListResponse)
async def live_watchers(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ActiveWatcherListResponse:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

    now = datetime.now(timezone.utc)
    cutoff = datetime.fromtimestamp(now.timestamp() - 35, tz=timezone.utc)
    rows = (
        await session.execute(
            select(EnrollShareLink, Lead)
            .join(Lead, Lead.id == EnrollShareLink.lead_id)
            .where(
                EnrollShareLink.first_viewed_at.is_not(None),
                EnrollShareLink.last_viewed_at.is_not(None),
                EnrollShareLink.last_viewed_at >= cutoff,
                Lead.deleted_at.is_(None),
            )
            .order_by(desc(EnrollShareLink.last_viewed_at))
            .limit(25)
        )
    ).all()

    items = [
        ActiveWatcherPublic(
            lead_id=lead.id,
            lead_name=lead.name or "Prospect",
            viewer_name=(link.viewer_name or "").strip() or (lead.name or None),
            viewer_phone=(link.viewer_phone or "").strip() or (lead.phone or None),
            unlocked_at=link.unlocked_at,
            started_at=link.first_viewed_at,
            last_seen_at=link.last_viewed_at or now,
            watch_completed=bool(link.status_synced),
        )
        for link, lead in rows
    ]
    return ActiveWatcherListResponse(items=items, total=len(items))


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
    link = await ensure_watch_timer_started(session, link=link)
    access_granted = has_watch_access(request, link=link, lead=lead)
    if not access_granted:
        clear_watch_cookie(response)
    room_snapshot = await _load_watch_room_snapshot(session)
    return _watch_page_payload(
        link=link,
        lead=lead,
        access_granted=access_granted,
        room_snapshot=room_snapshot,
    )


@watch_router.post("/watch/{token}/unlock", response_model=WatchPageData)
async def unlock_watch_video(
    token: str,
    body: WatchUnlockRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchPageData:
    link, lead = await _get_watch_link_and_lead(session, token)
    link = await ensure_watch_timer_started(session, link=link)
    expected_phone = normalize_phone_for_match(lead.phone)
    provided_phone = normalize_phone_for_match(body.phone)
    if expected_phone is None or provided_phone != expected_phone:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Use the same number that is registered on this lead.",
        )
    now = datetime.now(timezone.utc)
    clean_name = (body.name or "").strip()
    if clean_name:
        link.viewer_name = clean_name[:120]
    elif not (link.viewer_name or "").strip() and (lead.name or "").strip():
        link.viewer_name = (lead.name or "").strip()[:120]
    link.viewer_phone = provided_phone
    if link.unlocked_at is None:
        link.unlocked_at = now
    await session.commit()
    issue_watch_cookie(response, token=link.token, lead=lead, expires_at=link.expires_at)
    room_snapshot = await _load_watch_room_snapshot(session)
    return _watch_page_payload(
        link=link,
        lead=lead,
        access_granted=True,
        room_snapshot=room_snapshot,
    )


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


@watch_router.post("/watch/{token}/heartbeat", response_model=WatchEventResponse)
async def mark_watch_heartbeat(
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

    if link.first_viewed_at is None:
        link.first_viewed_at = now
        link.view_count = int(link.view_count or 0) + 1
    link.last_viewed_at = now
    if not link.status_synced:
        link.status_synced = True
    lead.last_action_at = now

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

    configured_source = await get_enrollment_video_source(session)
    source_candidates = build_enrollment_stream_source_candidates(link.youtube_url, configured_source)
    if not source_candidates:
        await require_secure_enrollment_video_source(session)
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video file is not available.")

    forward_headers: dict[str, str] = {}
    if request.headers.get("range"):
        forward_headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(60.0, connect=10.0))
    upstream: httpx.Response | None = None
    resolved_source: str | None = None

    for source_url in source_candidates:
        if is_youtube_like_url(source_url):
            continue
        upstream_url = absolute_video_source_url(request, source_url)
        try:
            candidate_upstream = await client.send(
                client.build_request("GET", upstream_url, headers=forward_headers),
                stream=True,
            )
        except httpx.HTTPError:
            continue

        if candidate_upstream.status_code in {200, 206}:
            upstream = candidate_upstream
            resolved_source = source_url
            break

        await candidate_upstream.aclose()

    if upstream is None or resolved_source is None:
        await client.aclose()
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video file is not available.")

    normalized_link_source = normalize_video_source_url(link.youtube_url)
    if resolved_source != normalized_link_source:
        link.youtube_url = resolved_source
        await session.commit()

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

