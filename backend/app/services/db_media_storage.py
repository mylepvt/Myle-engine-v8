"""Durable media storage in Postgres — the fallback when R2 is not configured.

Render's local disk is ephemeral, so proof/invoice/poster images written there
disappear on redeploy or free-plan spin-down (causing ``not_found`` when the
served URL is opened later). When R2 is unavailable we keep the bytes in the
database instead, and the ``/api/v1/media/...`` routes read them back from here.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_blob import MediaBlob


async def save_db_media(
    session: AsyncSession, *, key: str, data: bytes, content_type: str
) -> None:
    """Persist (or replace) the bytes for ``key`` in the database."""
    existing = (
        await session.execute(select(MediaBlob).where(MediaBlob.storage_key == key))
    ).scalar_one_or_none()
    if existing is not None:
        existing.content_type = content_type
        existing.data = data
        existing.byte_size = len(data)
    else:
        session.add(
            MediaBlob(
                storage_key=key,
                content_type=content_type,
                data=data,
                byte_size=len(data),
            )
        )
    await session.flush()


async def load_db_media(session: AsyncSession, key: str) -> tuple[bytes, str] | None:
    """Return ``(data, content_type)`` for ``key`` or ``None`` if absent."""
    row = (
        await session.execute(select(MediaBlob).where(MediaBlob.storage_key == key))
    ).scalar_one_or_none()
    if row is None:
        return None
    return row.data, row.content_type
