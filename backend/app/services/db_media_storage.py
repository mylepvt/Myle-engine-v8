"""Save / load uploaded file bytes in Postgres (see app.models.media_blob)."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_blob import MediaBlob

_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".webm": "audio/webm",
}


def content_type_for(name: str) -> str:
    dot = name.rfind(".")
    return _CONTENT_TYPES.get(name[dot:].lower(), "application/octet-stream") if dot != -1 else "application/octet-stream"


async def put_media(
    session: AsyncSession,
    *,
    kind: str,
    name: str,
    data: bytes,
    replace_prefix: str | None = None,
) -> None:
    """Store ``data`` as (kind, name), replacing an existing row with that name and,
    if given, every row whose name starts with ``replace_prefix`` (e.g. an avatar
    re-uploaded with a different extension). The caller commits."""
    await session.execute(delete(MediaBlob).where(MediaBlob.kind == kind, MediaBlob.name == name))
    if replace_prefix:
        await session.execute(
            delete(MediaBlob).where(MediaBlob.kind == kind, MediaBlob.name.startswith(replace_prefix))
        )
    session.add(MediaBlob(kind=kind, name=name, content_type=content_type_for(name), data=data))


async def get_media(session: AsyncSession, *, kind: str, name: str) -> MediaBlob | None:
    return (
        await session.execute(select(MediaBlob).where(MediaBlob.kind == kind, MediaBlob.name == name))
    ).scalar_one_or_none()


async def get_media_by_prefix(session: AsyncSession, *, kind: str, prefix: str) -> MediaBlob | None:
    return (
        await session.execute(
            select(MediaBlob)
            .where(MediaBlob.kind == kind, MediaBlob.name.startswith(prefix))
            .order_by(MediaBlob.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def delete_media(session: AsyncSession, *, kind: str, name: str) -> None:
    await session.execute(delete(MediaBlob).where(MediaBlob.kind == kind, MediaBlob.name == name))
