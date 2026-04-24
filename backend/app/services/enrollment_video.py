from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import jwt
from fastapi import HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.core.config import settings
from app.models.app_setting import AppSetting
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead

ENROLL_LINK_TTL_MINUTES = 30
ENROLL_WATCH_COOKIE = "myle_enroll_watch"

_PHONE_DIGIT_RE = re.compile(r"\D")
_PUBLIC_TOKEN_RE = re.compile(r"[^A-Za-z0-9_-]+")
_YOUTUBE_HOSTS = {"youtube.com", "youtu.be", "youtube-nocookie.com"}


def sanitize_public_token(raw_token: str) -> str:
    return _PUBLIC_TOKEN_RE.sub("", (raw_token or "").strip())


def normalize_phone_for_match(raw_phone: str | None) -> str | None:
    digits = _PHONE_DIGIT_RE.sub("", raw_phone or "")
    if len(digits) >= 10:
        return digits[-10:]
    return None


def whatsapp_digits(raw_phone: str | None) -> str:
    digits = _PHONE_DIGIT_RE.sub("", raw_phone or "")
    if not digits:
        return ""
    if len(digits) == 10 and digits[0] in {"6", "7", "8", "9"}:
        return f"91{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"91{digits[1:]}"
    return digits


def mask_phone(raw_phone: str | None) -> str:
    normalized = normalize_phone_for_match(raw_phone)
    if not normalized:
        return "registered number"
    return f"*******{normalized[-3:]}"


def is_youtube_like_url(raw_url: str | None) -> bool:
    candidate = (raw_url or "").strip()
    if not candidate:
        return False
    try:
        parsed = urlparse(candidate)
        host = (parsed.hostname or "").strip().lower()
        host = re.sub(r"^(www|m|music)\.", "", host)
        return host in _YOUTUBE_HOSTS
    except ValueError:
        return "youtu" in candidate.lower()


def absolute_video_source_url(request: Request, raw_url: str) -> str:
    value = raw_url.strip()
    if value.startswith(("http://", "https://")):
        return value
    base = str(request.base_url).rstrip("/")
    if value.startswith("/"):
        return f"{base}{value}"
    return f"{base}/{value.lstrip('/')}"


async def get_app_setting(session: AsyncSession, key: str) -> str:
    row = (
        await session.execute(select(AppSetting.value).where(AppSetting.key == key))
    ).scalar_one_or_none()
    return str(row or "").strip()


async def get_enrollment_video_title(session: AsyncSession) -> str:
    title = await get_app_setting(session, "enrollment_video_title")
    return title or "Enrollment video"


async def get_enrollment_video_source(session: AsyncSession) -> str:
    source = await get_app_setting(session, "enrollment_video_source_url")
    if not source:
        source = await get_app_setting(session, "enrollment_video_url")
    return source


async def require_secure_enrollment_video_source(session: AsyncSession) -> str:
    source = await get_enrollment_video_source(session)
    if not source:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Enrollment video source is not configured.",
        )
    if is_youtube_like_url(source):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Enrollment video must be a direct hosted video URL, not YouTube.",
        )
    return source


async def resolve_public_app_url(session: AsyncSession, request: Request) -> str:
    configured = await get_app_setting(session, "public_app_url")
    if not configured:
        configured = await get_app_setting(session, "frontend_public_url")
    if not configured:
        configured = str(request.base_url)
    return configured.rstrip("/")


def enrollment_expires_at(now: datetime | None = None) -> datetime:
    anchor = now or datetime.now(timezone.utc)
    return anchor + timedelta(minutes=ENROLL_LINK_TTL_MINUTES)


def ensure_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _watch_phone_proof(normalized_phone: str) -> str:
    secret = settings.secret_key.encode("utf-8")
    return hmac.new(secret, normalized_phone.encode("utf-8"), hashlib.sha256).hexdigest()


def _watch_cookie_payload(
    *,
    token: str,
    lead: Lead,
    expires_at: datetime,
) -> dict[str, Any]:
    normalized_phone = normalize_phone_for_match(lead.phone)
    if not normalized_phone:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Lead phone number is not set.",
        )
    return {
        "typ": "enroll_watch",
        "token": token,
        "lead_id": int(lead.id),
        "phone_proof": _watch_phone_proof(normalized_phone),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int(expires_at.timestamp()),
    }


def issue_watch_cookie(
    response: Response,
    *,
    token: str,
    lead: Lead,
    expires_at: datetime,
) -> None:
    encoded = jwt.encode(
        _watch_cookie_payload(token=token, lead=lead, expires_at=ensure_utc_datetime(expires_at)),
        settings.secret_key,
        algorithm="HS256",
    )
    safe_expiry = ensure_utc_datetime(expires_at)
    max_age = max(1, int((safe_expiry - datetime.now(timezone.utc)).total_seconds()))
    response.set_cookie(
        key=ENROLL_WATCH_COOKIE,
        value=encoded,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_watch_cookie(response: Response) -> None:
    response.delete_cookie(
        key=ENROLL_WATCH_COOKIE,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )


def has_watch_access(request: Request, *, link: EnrollShareLink, lead: Lead) -> bool:
    raw_cookie = request.cookies.get(ENROLL_WATCH_COOKIE)
    if not raw_cookie:
        return False
    try:
        payload = jwt.decode(raw_cookie, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return False
    if payload.get("typ") != "enroll_watch":
        return False
    if payload.get("token") != link.token:
        return False
    if int(payload.get("lead_id") or 0) != int(lead.id):
        return False
    normalized_phone = normalize_phone_for_match(lead.phone)
    if not normalized_phone:
        return False
    return payload.get("phone_proof") == _watch_phone_proof(normalized_phone)


async def expire_active_links_for_lead(
    session: AsyncSession,
    *,
    lead_id: int,
    now: datetime,
) -> None:
    await session.execute(
        update(EnrollShareLink)
        .where(
            EnrollShareLink.lead_id == lead_id,
            EnrollShareLink.expires_at > now,
        )
        .values(expires_at=now)
    )
