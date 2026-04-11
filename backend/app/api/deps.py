"""Shared FastAPI dependencies for HTTP routes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status

from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.config import settings
from app.core.jwt_tokens import decode_access_token
from app.db.session import get_db

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


def require_auth_user(request: Request) -> AuthUser:
    user = optional_auth_user_from_token(request.cookies.get(MYLE_ACCESS_COOKIE))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


CurrentUser = Annotated[AuthUser, Depends(require_auth_user)]
