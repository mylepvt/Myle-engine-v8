"""Resolve login identifier the same way as legacy Flask ``/login`` (FBO first, then username)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fbo_id import (
    digits_only_fbo,
    normalize_fbo_id,
    normalize_registration_fbo_id,
)
from app.models.user import User

if TYPE_CHECKING:
    pass


async def resolve_user_by_fbo_or_username(
    session: AsyncSession,
    raw: str,
) -> User | None:
    """Legacy order: normalized ``fbo_id`` match, else case-insensitive ``username``."""
    stripped = (raw or "").strip()
    if not stripped:
        return None
    fbo_key = normalize_fbo_id(stripped)
    r = await session.execute(select(User).where(User.fbo_id == fbo_key))
    u = r.scalar_one_or_none()
    if u is not None:
        return u
    un_lower = stripped.lower()
    r2 = await session.execute(
        select(User).where(func.lower(func.trim(User.username)) == un_lower)
    )
    return r2.scalar_one_or_none()


def validate_upline_for_team_registration(parent_role: str) -> tuple[bool, str]:
    """Same rules as legacy ``validate_upline_assignment_roles('team', ...)``."""
    p = (parent_role or "").strip().lower()
    if p not in ("leader", "admin"):
        return False, "Team members can only be assigned to a Leader or Admin."
    return True, ""


async def find_upline_user(session: AsyncSession, raw: str) -> User | None:
    """Resolve upline by FBO (exact / digit-signature) or username — legacy registration order."""
    s = (raw or "").strip()
    if not s:
        return None
    reg = normalize_registration_fbo_id(s)
    key = normalize_fbo_id(reg) if reg else ""
    if key:
        r = await session.execute(select(User).where(User.fbo_id == key))
        u = r.scalar_one_or_none()
        if u is not None:
            return u
    sig = digits_only_fbo(reg)
    if sig:
        r_all = await session.execute(select(User))
        for cand in r_all.scalars().all():
            if digits_only_fbo(cand.fbo_id or "") != sig:
                continue
            if (cand.registration_status or "").strip().lower() != "approved":
                continue
            return cand
    r3 = await session.execute(select(User).where(User.username == s))
    return r3.scalar_one_or_none()


async def is_fbo_digit_signature_taken(
    session: AsyncSession,
    *,
    normalized_fbo_id: str,
    exclude_user_id: int | None = None,
) -> bool:
    """Legacy: two FBOs with the same digit signature cannot both register."""
    sig = digits_only_fbo(normalized_fbo_id)
    if not sig:
        return False
    r = await session.execute(select(User.id, User.fbo_id))
    for uid, fid in r.all():
        if exclude_user_id is not None and uid == exclude_user_id:
            continue
        if digits_only_fbo(fid or "") == sig:
            return True
    return False


async def is_username_taken(session: AsyncSession, username: str) -> bool:
    un = (username or "").strip()
    if not un:
        return True
    r = await session.execute(
        select(User.id).where(func.lower(func.trim(User.username)) == un.lower())
    )
    return r.scalar_one_or_none() is not None


async def is_phone_taken(session: AsyncSession, phone: str) -> bool:
    p = (phone or "").strip()
    if not p:
        return False
    r = await session.execute(select(User.id).where(User.phone == p))
    return r.scalar_one_or_none() is not None


_USERNAME_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def assert_safe_username(username: str) -> None:
    """Minimal guard; legacy allowed most printable strings."""
    u = (username or "").strip()
    if len(u) < 2 or len(u) > 128:
        raise ValueError("Username length invalid")
    if _USERNAME_RE.search(u):
        raise ValueError("Username contains invalid characters")
