"""Resolve login identifier the same way as legacy Flask ``/login`` (FBO first, then username)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fbo_id import normalize_fbo_id
from app.models.user import User


async def resolve_user_by_fbo_or_username(
    session: AsyncSession,
    raw: str,
) -> User | None:
    """Legacy order: ``TRIM(fbo_id)`` match (we store normalized lowercase), else exact ``username``."""
    stripped = (raw or "").strip()
    if not stripped:
        return None
    fbo_key = normalize_fbo_id(stripped)
    r = await session.execute(select(User).where(User.fbo_id == fbo_key))
    u = r.scalar_one_or_none()
    if u is not None:
        return u
    r2 = await session.execute(select(User).where(User.username == stripped))
    return r2.scalar_one_or_none()
