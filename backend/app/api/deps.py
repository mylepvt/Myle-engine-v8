"""Shared FastAPI dependencies for HTTP routes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.config import settings
from app.core.auth_login_guards import ensure_may_issue_session_cookies
from app.core.jwt_tokens import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.member_compliance import ensure_user_compliance_snapshot

__all__ = ["get_db", "AuthUser", "require_auth_user", "optional_auth_user_from_token"]


@dataclass(frozen=True)
class AuthUser:
    """Authenticated principal from cookie JWT (user id + role + claims)."""

    user_id: int
    role: str
    email: str
    fbo_id: str = ""
    username: str = ""
    display_name: str = ""
    auth_version: int | None = None


def optional_auth_user_from_token(token: Optional[str]) -> Optional[AuthUser]:
    """Parse access JWT (same rules as HTTP cookie auth). Used by WebSocket + tests."""
    if not token:
        return None
    payload = decode_access_token(token, settings.secret_key)
    if not payload:
        return None
    role = payload.get("role")
    if not isinstance(role, str):
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        return None
    user_id = int(sub)
    email_raw = payload.get("email")
    email = email_raw if isinstance(email_raw, str) else ""
    fbo_raw = payload.get("fbo_id")
    fbo_id = fbo_raw if isinstance(fbo_raw, str) else ""
    un_raw = payload.get("username")
    username = un_raw if isinstance(un_raw, str) else ""
    dn_raw = payload.get("display_name")
    display_name = dn_raw if isinstance(dn_raw, str) else ""
    ver_raw = payload.get("ver")
    auth_version: int | None = None
    if isinstance(ver_raw, int):
        auth_version = ver_raw
    elif isinstance(ver_raw, float) and ver_raw == int(ver_raw):
        auth_version = int(ver_raw)
    return AuthUser(
        user_id=user_id,
        role=role,
        email=email,
        fbo_id=fbo_id,
        username=username,
        display_name=display_name,
        auth_version=auth_version,
    )


async def require_auth_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthUser:
    token_user = optional_auth_user_from_token(request.cookies.get(MYLE_ACCESS_COOKIE))
    if token_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    await ensure_user_compliance_snapshot(session, user_id=token_user.user_id, apply_actions=True)
    row = (
        await session.execute(select(User).where(User.id == token_user.user_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    ensure_may_issue_session_cookies(row)
    return AuthUser(
        user_id=row.id,
        role=row.role,
        email=row.email,
        fbo_id=row.fbo_id,
        username=(row.username or "").strip(),
        display_name=(row.name or row.username or row.fbo_id or "").strip(),
        auth_version=token_user.auth_version,
    )


CurrentUser = Annotated[AuthUser, Depends(require_auth_user)]
