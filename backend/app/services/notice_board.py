"""Notice board helpers: voice notices, play tracking, replies, audience."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement
from app.models.announcement_play import AnnouncementPlay
from app.models.announcement_reply import AnnouncementReply
from app.models.user import User
from app.schemas.notice_board import AnnouncementOut
from app.services.push_service import send_push_to_user_ids

logger = logging.getLogger(__name__)

NOTICE_AUDIO_KIND = "notice-audio"
NOTICE_BOARD_URL = "/dashboard/other/notice-board"
# ~10 minutes of Opus/AAC voice comfortably fits; keeps a single blob small enough for Postgres.
MAX_NOTICE_AUDIO_BYTES = 15 * 1024 * 1024
MAX_NOTICE_AUDIO_SECONDS = 10 * 60

# Recorder MIME (without codec params) → stored file extension.
_AUDIO_EXTENSIONS = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "video/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}


def audio_extension_for(content_type: Optional[str]) -> Optional[str]:
    base = (content_type or "").split(";", 1)[0].strip().lower()
    return _AUDIO_EXTENSIONS.get(base)


def audio_url_for(announcement: Announcement) -> Optional[str]:
    if not announcement.audio_name:
        return None
    return f"/api/v1/other/notice-board/{announcement.id}/audio"


def display_name(user: User) -> str:
    for value in (user.name, user.username, user.fbo_id):
        if value and value.strip():
            return value.strip()
    return user.email.split("@", 1)[0] if user.email else str(user.id)


def audience_conditions() -> list:
    """Members a notice is meant for: approved, active team members and leaders."""
    return [
        User.role.in_(("team", "leader")),
        User.registration_status == "approved",
        User.access_blocked.is_(False),
        User.removed_at.is_(None),
        or_(User.discipline_status.is_(None), func.lower(User.discipline_status) != "removed"),
    ]


async def audience_count(session: AsyncSession) -> int:
    return int(
        (await session.execute(select(func.count(User.id)).where(*audience_conditions()))).scalar_one()
    )


async def notify_notice_audience_bg(session_factory: Any, *, title: str, body: str) -> None:
    """Background task: push a new notice to every member of the notice audience
    (includes members still in training, unlike the report-eligible role pushes)."""
    try:
        async with session_factory() as session:
            ids = list((await session.execute(select(User.id).where(*audience_conditions()))).scalars().all())
            await send_push_to_user_ids(session, ids, title=title, body=body, url=NOTICE_BOARD_URL)
    except Exception as exc:  # noqa: BLE001
        logger.error("notice push failed: %s", exc)


async def attach_notice_extras(
    items: list[AnnouncementOut],
    rows: list[Announcement],
    session: AsyncSession,
    *,
    user_id: int,
    is_admin: bool,
) -> None:
    """Fill voice, reply and play fields on already-validated announcement items."""
    if not items:
        return
    by_id = {r.id: r for r in rows}
    ids = [i.id for i in items]

    reply_counts = dict(
        (
            await session.execute(
                select(AnnouncementReply.announcement_id, func.count(AnnouncementReply.id))
                .where(AnnouncementReply.announcement_id.in_(ids))
                .group_by(AnnouncementReply.announcement_id)
            )
        ).all()
    )
    my_plays = set(
        (
            await session.execute(
                select(AnnouncementPlay.announcement_id).where(
                    AnnouncementPlay.announcement_id.in_(ids),
                    AnnouncementPlay.user_id == user_id,
                )
            )
        ).scalars().all()
    )

    played_counts: dict[int, int] = {}
    total_audience: Optional[int] = None
    voice_ids = [i for i in ids if by_id.get(i) is not None and by_id[i].audio_name]
    if is_admin and voice_ids:
        total_audience = await audience_count(session)
        played_counts = dict(
            (
                await session.execute(
                    select(AnnouncementPlay.announcement_id, func.count(AnnouncementPlay.id))
                    .join(User, User.id == AnnouncementPlay.user_id)
                    .where(AnnouncementPlay.announcement_id.in_(voice_ids), *audience_conditions())
                    .group_by(AnnouncementPlay.announcement_id)
                )
            ).all()
        )

    for item in items:
        row = by_id.get(item.id)
        item.reply_count = int(reply_counts.get(item.id, 0))
        if row is None or not row.audio_name:
            continue
        item.audio_url = audio_url_for(row)
        item.audio_duration_sec = row.audio_duration_sec
        item.played_by_me = item.id in my_plays
        if is_admin:
            item.played_count = int(played_counts.get(item.id, 0))
            item.audience_count = total_audience
