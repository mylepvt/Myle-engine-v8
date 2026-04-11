"""Request-scoped identity helpers.

Legacy Flask app stored ``user_id``, ``username``, ``fbo_id`` on the server session
(see ``legacy/.../auth_context.py``). In vl2, identity lives in **signed JWTs** in cookies;
:func:`require_auth_user` / :class:`AuthUser` are the source of truth per request.

Use :func:`acting_user_id` and friends on an :class:`AuthUser` instance. To **reload**
claims from the database after a profile or admin edit (legacy ``refresh_session_user``),
call :func:`refresh_session_identity` or ``POST /api/v1/auth/sync-identity``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_constants import AUTH_SESSION_VERSION
from app.core.auth_cookies import issue_session_cookies
from app.models.user import User

if TYPE_CHECKING:
    from app.api.deps import AuthUser

# Re-export for callers that imported from here before.
__all__ = [
    "AUTH_SESSION_VERSION",
    "acting_user_id",
    "acting_username",
    "acting_fbo_id",
    "acting_display_name",
    "acting_user_id_optional",
    "acting_username_optional",
    "acting_fbo_id_optional",
    "acting_display_name_optional",
    "refresh_session_identity",
]


def acting_user_id(user: AuthUser) -> int:
    """Current principal's user id (from access JWT)."""
    return user.user_id


def acting_username(user: AuthUser) -> str | None:
    u = (user.username or "").strip()
    return u or None


def acting_fbo_id(user: AuthUser) -> str:
    return (user.fbo_id or "").strip()


def acting_display_name(user: AuthUser) -> str:
    """Legacy session ``display_name`` (from ``users.name``); vl2 uses JWT ``display_name`` claim."""
    return (user.display_name or "").strip()


def acting_user_id_optional(user: AuthUser | None) -> int | None:
    return user.user_id if user is not None else None


def acting_username_optional(user: AuthUser | None) -> str | None:
    if user is None:
        return None
    return acting_username(user)


def acting_fbo_id_optional(user: AuthUser | None) -> str:
    if user is None:
        return ""
    return acting_fbo_id(user)


def acting_display_name_optional(user: AuthUser | None) -> str:
    if user is None:
        return ""
    return acting_display_name(user)


async def refresh_session_identity(
    db: AsyncSession,
    *,
    user_id: int,
    response: Response,
) -> bool:
    """Reload ``User`` from the database and re-issue access + refresh cookies.

    Equivalent to legacy ``refresh_session_user``: updates cookie claims (role,
    ``fbo_id``, ``username``, ``display_name``, email, ``ver``) without requiring password again.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return False
    issue_session_cookies(response, user)
    return True
