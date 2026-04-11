from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_db
from app.core.auth_context import refresh_session_identity
from app.core.auth_cookies import clear_session_cookies, issue_session_cookies
from app.core.auth_cookie import MYLE_ACCESS_COOKIE, MYLE_REFRESH_COOKIE
from app.core.config import settings
from app.core.jwt_tokens import decode_access_token, decode_refresh_token
from app.core.passwords import (
    hash_password,
    should_upgrade_stored_password_to_bcrypt,
    verify_password_legacy_compatible,
)
from app.models.user import User
from app.services.login_identity import resolve_user_by_fbo_or_username
from app.schemas.auth import DevLoginRequest, DevLoginResponse, LoginRequest, MeResponse
from app.services.dev_users import dev_email_for_role

router = APIRouter()


@router.get("/me", response_model=MeResponse)
async def read_me(request: Request) -> MeResponse:
    token = request.cookies.get(MYLE_ACCESS_COOKIE)
    if not token:
        return MeResponse()
    payload = decode_access_token(token, settings.secret_key)
    if not payload:
        return MeResponse()
    role = payload.get("role")
    if not isinstance(role, str):
        return MeResponse()
    user_id = None
    sub = payload.get("sub")
    if isinstance(sub, str) and sub.isdigit():
        user_id = int(sub)
    email = payload.get("email")
    email_s = email if isinstance(email, str) else None
    fbo_raw = payload.get("fbo_id")
    fbo_s = fbo_raw if isinstance(fbo_raw, str) else None
    un_raw = payload.get("username")
    un_s = un_raw if isinstance(un_raw, str) else None
    dn_raw = payload.get("display_name")
    dn_s = dn_raw if isinstance(dn_raw, str) else None
    ver_raw = payload.get("ver")
    ver_s: int | None = None
    if isinstance(ver_raw, int):
        ver_s = ver_raw
    elif isinstance(ver_raw, float) and ver_raw == int(ver_raw):
        ver_s = int(ver_raw)
    return MeResponse(
        authenticated=True,
        role=role,
        user_id=user_id,
        fbo_id=fbo_s,
        username=un_s,
        email=email_s,
        display_name=dn_s,
        auth_version=ver_s,
    )


@router.post("/dev-login", response_model=DevLoginResponse)
async def dev_login(
    body: DevLoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DevLoginResponse:
    if not settings.auth_dev_login_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    email = dev_email_for_role(body.role)
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=500,
            detail="Dev user missing; run database migrations",
        )
    issue_session_cookies(response, user)
    return DevLoginResponse()


@router.post("/login", response_model=DevLoginResponse)
async def login_with_password(
    body: LoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DevLoginResponse:
    """FBO ID or username + password — legacy-compatible verification (bcrypt / Werkzeug / plain)."""
    user = await resolve_user_by_fbo_or_username(session, body.fbo_id)
    if user is None or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid FBO ID or password",
        )
    if not verify_password_legacy_compatible(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid FBO ID or password",
        )
    if should_upgrade_stored_password_to_bcrypt(user.hashed_password):
        user.hashed_password = hash_password(body.password)
        await session.commit()
        await session.refresh(user)
    issue_session_cookies(response, user)
    return DevLoginResponse()


@router.post("/refresh", response_model=DevLoginResponse)
async def refresh_session(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DevLoginResponse:
    raw = request.cookies.get(MYLE_REFRESH_COOKIE)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required",
        )
    payload = decode_refresh_token(raw, settings.secret_key)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    uid = int(sub)
    result = await session.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    issue_session_cookies(response, user)
    return DevLoginResponse()


@router.post("/sync-identity", response_model=DevLoginResponse)
async def sync_identity(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
    auth: CurrentUser,
) -> DevLoginResponse:
    """Reload the signed-in user from the database and re-issue JWT cookies.

    Use after profile changes or admin edits so ``fbo_id``, ``username``, ``role``, and
    ``email`` claims match ``users`` without waiting for access-token expiry.
    """
    ok = await refresh_session_identity(session, user_id=auth.user_id, response=response)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return DevLoginResponse()


@router.post("/logout", response_model=DevLoginResponse)
async def logout(response: Response) -> DevLoginResponse:
    clear_session_cookies(response)
    return DevLoginResponse()
