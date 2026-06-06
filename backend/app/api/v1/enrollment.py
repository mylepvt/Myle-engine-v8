"""Standalone secure enrollment-video endpoints.

Admin router  : generate + list links (auth required).
Public router : watch / open / stream (token + device + cookie gated, no login).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.enrollment_share_link import EnrollmentShareLink
from app.models.user import User
from app.schemas.enrollment import (
    EnrollmentEventResponse,
    EnrollmentLinkCreate,
    EnrollmentLinkPublic,
    EnrollmentOpenRequest,
    EnrollmentWatchData,
)
from app.services import enrollment_video as ev

router = APIRouter()
public_router = APIRouter()


def _public(link: EnrollmentShareLink) -> EnrollmentLinkPublic:
    return EnrollmentLinkPublic(
        token=link.token,
        viewer_name=link.viewer_name,
        title=link.title,
        view_count=int(link.view_count or 0),
        max_views=int(link.max_views or ev.DEFAULT_MAX_VIEWS),
        window_seconds=int(link.window_seconds or ev.DEFAULT_WINDOW_SECONDS),
        device_locked=bool(link.device_fingerprint),
        opened_at=link.opened_at,
        expires_at=link.expires_at,
        creation_expires_at=link.creation_expires_at,
        created_at=link.created_at,
    )


async def _require_enroll_access(session: AsyncSession, user: AuthUser) -> None:
    """Admins always allowed; everyone else needs the admin-granted flag."""
    if (user.role or "").strip().lower() == "admin":
        return
    db_user = await session.get(User, user.user_id)
    if db_user is None or not bool(getattr(db_user, "enrollment_link_access", False)):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have access to enrollment links. Ask an admin to enable it.",
        )


async def _get_link(session: AsyncSession, token: str) -> EnrollmentShareLink:
    clean = ev.sanitize_public_token(token)
    if not clean:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid link.")
    link = (
        await session.execute(
            select(EnrollmentShareLink).where(EnrollmentShareLink.token == clean)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="This private link was not found.")
    return link


# ── admin ────────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=EnrollmentLinkPublic, status_code=http_status.HTTP_201_CREATED)
async def generate_enrollment_link(
    body: EnrollmentLinkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentLinkPublic:
    await _require_enroll_access(session, user)
    now = datetime.now(timezone.utc)
    link = EnrollmentShareLink(
        token=ev.new_token(),
        created_by_user_id=user.user_id,
        viewer_name=(body.viewer_name or "").strip()[:120] or None,
        viewer_phone=ev.normalize_phone(body.viewer_phone) or None,
        video_source=body.video_source.strip(),
        title=(body.title or "").strip()[:200] or "Enrollment video",
        max_views=int(body.max_views or ev.DEFAULT_MAX_VIEWS),
        window_seconds=int(body.window_seconds or ev.DEFAULT_WINDOW_SECONDS),
        creation_expires_at=now + ev.DEFAULT_CREATION_CAP,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return _public(link)


@router.get("/links", response_model=list[EnrollmentLinkPublic])
async def list_my_enrollment_links(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[EnrollmentLinkPublic]:
    await _require_enroll_access(session, user)
    rows = (
        await session.execute(
            select(EnrollmentShareLink)
            .where(EnrollmentShareLink.created_by_user_id == user.user_id)
            .order_by(EnrollmentShareLink.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [_public(r) for r in rows]


@router.post("/{token}/revoke", response_model=EnrollmentEventResponse)
async def revoke_enrollment_link(
    token: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentEventResponse:
    await _require_enroll_access(session, user)
    link = await _get_link(session, token)
    if link.created_by_user_id != user.user_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your link.")
    link.revoked = True
    await session.commit()
    return EnrollmentEventResponse(ok=True)


# ── public watch ──────────────────────────────────────────────────────────────

def _watch_data(
    link: EnrollmentShareLink,
    *,
    access_granted: bool,
    now: datetime,
) -> EnrollmentWatchData:
    dead = ev.is_dead(link, now=now)
    reason = None
    if dead:
        if link.revoked:
            reason = "This link has been revoked."
        elif ev.effective_expiry(link) and now >= ev.effective_expiry(link):
            reason = "This private video link has expired."
        else:
            reason = "This link is no longer available."
    return EnrollmentWatchData(
        token=link.token,
        title=link.title or "Enrollment video",
        watermark_label=ev.watermark_label(link),
        access_granted=access_granted and not dead,
        stream_url=f"/api/v1/enroll/{link.token}/stream" if (access_granted and not dead) else None,
        window_seconds=int(link.window_seconds or ev.DEFAULT_WINDOW_SECONDS),
        expires_at=link.expires_at,
        dead=dead,
        dead_reason=reason,
    )


@public_router.get("/enroll/{token}", response_model=EnrollmentWatchData)
async def enroll_watch_page(
    token: str,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentWatchData:
    link = await _get_link(session, token)
    now = datetime.now(timezone.utc)
    access = ev.has_access(request, link=link) and not ev.is_dead(link, now=now)
    if not access:
        ev.clear_cookie(response)
    return _watch_data(link, access_granted=access, now=now)


@public_router.post("/enroll/{token}/open", response_model=EnrollmentWatchData)
async def enroll_open(
    token: str,
    body: EnrollmentOpenRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> EnrollmentWatchData:
    link = await _get_link(session, token)
    now = datetime.now(timezone.utc)

    if ev.is_dead(link, now=now):
        ev.clear_cookie(response)
        return _watch_data(link, access_granted=False, now=now)

    fp = ev.sanitize_fingerprint(body.fingerprint)
    if len(fp) < 4:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Could not verify this device.")

    # First-device lock.
    if not ev.device_matches(link, fp):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="This link is locked to the device it was first opened on.",
        )

    first_open = link.device_fingerprint is None
    if first_open:
        link.device_fingerprint = fp
        link.device_locked_at = now
        link.opened_at = now
        link.first_viewed_at = now
        link.expires_at = now + timedelta(seconds=int(link.window_seconds or ev.DEFAULT_WINDOW_SECONDS))
        link.view_count = int(link.view_count or 0) + 1

    link.last_viewed_at = now
    await session.commit()
    await session.refresh(link)

    expiry = ev.effective_expiry(link) or (now + timedelta(seconds=int(link.window_seconds)))
    ev.issue_cookie(response, token=link.token, fingerprint=fp, expires_at=expiry)
    return _watch_data(link, access_granted=True, now=now)


async def _close(upstream: httpx.Response, client: httpx.AsyncClient) -> None:
    await upstream.aclose()
    await client.aclose()


@public_router.get("/enroll/{token}/stream")
async def enroll_stream(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    link = await _get_link(session, token)
    now = datetime.now(timezone.utc)
    if ev.is_dead(link, now=now) or not ev.has_access(request, link=link):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="This private video is not available.")

    upstream_url = await ev.resolve_stream_upstream(request, link)
    if not upstream_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video file is not available.")

    forward: dict[str, str] = {}
    if request.headers.get("range"):
        forward["Range"] = request.headers["range"]

    client = httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(60.0, connect=10.0))
    try:
        upstream = await client.send(
            client.build_request("GET", upstream_url, headers=forward), stream=True
        )
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(status_code=http_status.HTTP_502_BAD_GATEWAY, detail="Video source unavailable.")

    if upstream.status_code not in {200, 206}:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video file is not available.")

    headers = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="enrollment-video"',
    }
    for key in ("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"):
        value = upstream.headers.get(key)
        if value:
            headers[key] = value

    return StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "video/mp4"),
        headers=headers,
        background=BackgroundTask(_close, upstream, client),
    )
