"""Notice board: voice notices, play tracking ("who listened") and replies.

Mounted under ``/other`` next to the text notice-board routes in ``other_pages``.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.session import AsyncSessionLocal
from app.models.announcement import Announcement
from app.models.announcement_play import AnnouncementPlay
from app.models.announcement_reply import AnnouncementReply
from app.models.user import User
from app.schemas.notice_board import (
    AnnouncementOut,
    ListenerRow,
    ListenersResponse,
    PlayEvent,
    RepliesResponse,
    ReplyCreate,
    ReplyOut,
)
from app.services.db_media_storage import get_media, put_media
from app.services.notice_board import (
    MAX_NOTICE_AUDIO_BYTES,
    MAX_NOTICE_AUDIO_SECONDS,
    NOTICE_AUDIO_KIND,
    attach_notice_extras,
    audience_conditions,
    audio_extension_for,
    display_name,
    notify_notice_audience_bg,
)

router = APIRouter()

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _acting_label(user: AuthUser) -> str:
    if user.username and user.username.strip():
        return user.username.strip()
    if user.fbo_id:
        return user.fbo_id
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0]
    return str(user.user_id)


async def _get_notice(session: AsyncSession, announcement_id: int) -> Announcement:
    row = await session.get(Announcement, announcement_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Notice not found")
    return row


def _format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return ""
    return f"{seconds // 60}:{seconds % 60:02d}"


@router.post(
    "/notice-board/voice",
    response_model=AnnouncementOut,
    status_code=http_status.HTTP_201_CREATED,
)
async def notice_board_create_voice(
    background_tasks: BackgroundTasks,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    message: str = Form(""),
    pin: bool = Form(False),
    duration_sec: Optional[int] = Form(None),
) -> AnnouncementOut:
    """Admin: post a voice notice (recorded in the browser), with an optional caption."""
    _require_admin(user)
    ext = audio_extension_for(file.content_type)
    if ext is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Unsupported audio format. Record again or upload an mp3/m4a/webm file.",
        )
    data = await file.read(MAX_NOTICE_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="The recording is empty.")
    if len(data) > MAX_NOTICE_AUDIO_BYTES:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Voice note is too large. Keep it under 10 minutes.",
        )
    caption = message.strip()
    if len(caption) > 2000:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Caption is too long.")
    duration = None
    if duration_sec is not None and duration_sec > 0:
        duration = min(int(duration_sec), MAX_NOTICE_AUDIO_SECONDS)

    name = f"{uuid4().hex}{ext}"
    await put_media(session, kind=NOTICE_AUDIO_KIND, name=name, data=data)
    row = Announcement(
        message=caption,
        created_by=_acting_label(user),
        pin=pin,
        audio_name=name,
        audio_duration_sec=duration,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    item = AnnouncementOut.model_validate(row)
    await attach_notice_extras([item], [row], session, user_id=user.user_id, is_admin=True)

    length = _format_duration(duration)
    body = caption or (f"Tap to listen ({length})" if length else "Tap to listen")
    background_tasks.add_task(
        notify_notice_audience_bg,
        AsyncSessionLocal,
        title="New voice notice",
        body=body[:140],
    )
    return item


@router.get("/notice-board/{announcement_id}/audio")
async def notice_board_audio(
    announcement_id: int,
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stream a voice notice. Supports HTTP Range so iPhone Safari can play and seek."""
    row = await _get_notice(session, announcement_id)
    if not row.audio_name:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="No voice note")
    blob = await get_media(session, kind=NOTICE_AUDIO_KIND, name=row.audio_name)
    if blob is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Voice note missing")

    data = blob.data
    size = len(data)
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
    }
    range_header = request.headers.get("range")
    match = _RANGE_RE.fullmatch(range_header.strip()) if range_header else None
    if match and (match.group(1) or match.group(2)):
        start_s, end_s = match.groups()
        if start_s:
            start = int(start_s)
            end = min(int(end_s), size - 1) if end_s else size - 1
        else:  # suffix range: last N bytes
            start = max(size - int(end_s), 0)
            end = size - 1
        if start >= size or start > end:
            return Response(
                status_code=416,
                headers={**headers, "Content-Range": f"bytes */{size}"},
            )
        return Response(
            content=data[start : end + 1],
            status_code=http_status.HTTP_206_PARTIAL_CONTENT,
            media_type=blob.content_type,
            headers={**headers, "Content-Range": f"bytes {start}-{end}/{size}"},
        )
    return Response(content=data, media_type=blob.content_type, headers=headers)


@router.post("/notice-board/{announcement_id}/played", status_code=http_status.HTTP_204_NO_CONTENT)
async def notice_board_mark_played(
    announcement_id: int,
    body: PlayEvent,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Record that the current member played (or finished) a voice notice."""
    row = await _get_notice(session, announcement_id)
    if not row.audio_name or user.role == "admin":
        return
    now = datetime.now(timezone.utc)
    play = (
        await session.execute(
            select(AnnouncementPlay).where(
                AnnouncementPlay.announcement_id == announcement_id,
                AnnouncementPlay.user_id == user.user_id,
            )
        )
    ).scalar_one_or_none()
    if play is None:
        session.add(
            AnnouncementPlay(
                announcement_id=announcement_id,
                user_id=user.user_id,
                first_played_at=now,
                last_played_at=now,
                play_count=1,
                completed=body.completed,
            )
        )
    else:
        if body.completed:
            play.completed = True
        else:
            play.play_count += 1
        play.last_played_at = now
    await session.commit()


@router.get("/notice-board/{announcement_id}/listeners", response_model=ListenersResponse)
async def notice_board_listeners(
    announcement_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ListenersResponse:
    """Admin: who has played this voice notice and who has not."""
    _require_admin(user)
    await _get_notice(session, announcement_id)
    members = (
        await session.execute(select(User).where(*audience_conditions()).order_by(User.name, User.id))
    ).scalars().all()
    plays = {
        p.user_id: p
        for p in (
            await session.execute(
                select(AnnouncementPlay).where(AnnouncementPlay.announcement_id == announcement_id)
            )
        ).scalars().all()
    }
    played: list[ListenerRow] = []
    not_played: list[ListenerRow] = []
    for m in members:
        base = {"user_id": m.id, "name": display_name(m), "role": m.role, "fbo_id": m.fbo_id}
        p = plays.get(m.id)
        if p is None:
            not_played.append(ListenerRow(**base))
        else:
            played.append(
                ListenerRow(
                    **base,
                    first_played_at=p.first_played_at,
                    last_played_at=p.last_played_at,
                    play_count=p.play_count,
                    completed=p.completed,
                )
            )
    played.sort(key=lambda r: r.first_played_at or datetime.min.replace(tzinfo=timezone.utc))
    return ListenersResponse(
        announcement_id=announcement_id,
        audience_count=len(members),
        played=played,
        not_played=not_played,
    )


def _reply_out(reply: AnnouncementReply, author: Optional[User], viewer: AuthUser) -> ReplyOut:
    mine = reply.user_id == viewer.user_id
    return ReplyOut(
        id=reply.id,
        announcement_id=reply.announcement_id,
        user_id=reply.user_id,
        author=display_name(author) if author else "Member",
        role=(author.role if author else "team"),
        body=reply.body,
        created_at=reply.created_at,
        mine=mine,
        can_delete=mine or viewer.role == "admin",
    )


@router.get("/notice-board/{announcement_id}/replies", response_model=RepliesResponse)
async def notice_board_replies(
    announcement_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RepliesResponse:
    await _get_notice(session, announcement_id)
    rows = (
        await session.execute(
            select(AnnouncementReply, User)
            .join(User, User.id == AnnouncementReply.user_id, isouter=True)
            .where(AnnouncementReply.announcement_id == announcement_id)
            .order_by(AnnouncementReply.created_at, AnnouncementReply.id)
        )
    ).all()
    items = [_reply_out(reply, author, user) for reply, author in rows]
    return RepliesResponse(items=items, total=len(items))


@router.post(
    "/notice-board/{announcement_id}/replies",
    response_model=ReplyOut,
    status_code=http_status.HTTP_201_CREATED,
)
async def notice_board_add_reply(
    announcement_id: int,
    body: ReplyCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ReplyOut:
    await _get_notice(session, announcement_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Reply cannot be empty.")
    reply = AnnouncementReply(announcement_id=announcement_id, user_id=user.user_id, body=text)
    session.add(reply)
    await session.commit()
    await session.refresh(reply)
    author = await session.get(User, user.user_id)
    return _reply_out(reply, author, user)


@router.delete(
    "/notice-board/{announcement_id}/replies/{reply_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
)
async def notice_board_delete_reply(
    announcement_id: int,
    reply_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    reply = await session.get(AnnouncementReply, reply_id)
    if reply is None or reply.announcement_id != announcement_id:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Reply not found")
    if reply.user_id != user.user_id and user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You can only delete your own reply")
    await session.delete(reply)
    await session.commit()
