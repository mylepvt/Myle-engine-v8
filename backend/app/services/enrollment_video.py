"""Security core for the standalone, highly-secured enrollment-video page.

Layers enforced here:
  * unguessable 256-bit token
  * JWT watch cookie bound to (token + device fingerprint)
  * first-device lock
  * hard view cap (default 1)
  * open-based countdown expiry (+ outer creation cap)
  * server-side R2 presign + proxy so the real video URL never reaches the
    browser
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Request, Response

from app.core.config import settings
from app.models.enrollment_share_link import EnrollmentShareLink
from app.services import r2_storage

ENROLL2_WATCH_COOKIE = "myle_enroll2_watch"

# Defaults: 16:56 (1016s) video + ~1-min buffer = 18 min, single device, single view.
DEFAULT_WINDOW_SECONDS = 18 * 60
DEFAULT_CREATION_CAP = timedelta(days=2)
DEFAULT_MAX_VIEWS = 1

_PUBLIC_TOKEN_RE = re.compile(r"[^A-Za-z0-9_\-]")
_FINGERPRINT_RE = re.compile(r"[^A-Za-z0-9]")
_HAS_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.\-]*://", re.IGNORECASE)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def sanitize_public_token(raw_token: str) -> str:
    return _PUBLIC_TOKEN_RE.sub("", (raw_token or "").strip())


def sanitize_fingerprint(raw_fp: str | None) -> str:
    return _FINGERPRINT_RE.sub("", (raw_fp or "").strip())[:128]


def normalize_phone(raw_phone: str | None) -> str:
    return re.sub(r"\D", "", raw_phone or "")[-10:]


def mask_phone(raw_phone: str | None) -> str:
    digits = normalize_phone(raw_phone)
    if len(digits) < 4:
        return "•••• ••••"
    return f"•••• •••• {digits[-4:]}"


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# ── expiry ────────────────────────────────────────────────────────────────

def effective_expiry(link: EnrollmentShareLink) -> Optional[datetime]:
    """Earliest of the open-countdown expiry and the outer creation cap."""
    candidates = [v for v in (link.expires_at, link.creation_expires_at) if v is not None]
    if not candidates:
        return None
    return min(ensure_utc(v) for v in candidates)


def is_dead(link: EnrollmentShareLink, *, now: datetime) -> bool:
    if link.revoked:
        return True
    expiry = effective_expiry(link)
    if expiry is not None and now >= expiry:
        return True
    if int(link.view_count or 0) >= int(link.max_views or DEFAULT_MAX_VIEWS) and link.opened_at is None:
        # cap already consumed before this device ever bound — defensive
        return True
    return False


# ── watermark ───────────────────────────────────────────────────────────────

def watermark_label(link: EnrollmentShareLink) -> str:
    name = (link.viewer_name or "").strip()
    phone = mask_phone(link.viewer_phone)
    short = (link.token or "")[:6]
    parts = [p for p in (name, phone, f"#{short}") if p]
    return " · ".join(parts)


# ── cookie (token + device fingerprint bound, JWT signed) ────────────────────

def _cookie_payload(*, token: str, fingerprint: str, expires_at: datetime) -> dict[str, object]:
    return {
        "t": token,
        "fp": fingerprint,
        "exp": int(ensure_utc(expires_at).timestamp()),
    }


def issue_cookie(
    response: Response,
    *,
    token: str,
    fingerprint: str,
    expires_at: datetime,
) -> None:
    safe_expiry = ensure_utc(expires_at)
    encoded = jwt.encode(
        _cookie_payload(token=token, fingerprint=fingerprint, expires_at=safe_expiry),
        settings.secret_key,
        algorithm="HS256",
    )
    max_age = max(int((safe_expiry - datetime.now(timezone.utc)).total_seconds()), 0)
    response.set_cookie(
        ENROLL2_WATCH_COOKIE,
        encoded,
        max_age=max_age,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(
        ENROLL2_WATCH_COOKIE,
        path="/",
        samesite=settings.auth_cookie_samesite,
        secure=settings.session_cookie_secure,
    )


def has_access(request: Request, *, link: EnrollmentShareLink) -> bool:
    """True only when the request carries a valid cookie bound to this token
    AND the device fingerprint matches the one locked on first open."""
    raw = request.cookies.get(ENROLL2_WATCH_COOKIE)
    if not raw:
        return False
    try:
        payload = jwt.decode(raw, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return False
    if payload.get("t") != link.token:
        return False
    locked = link.device_fingerprint
    if not locked:
        return False
    if payload.get("fp") != locked:
        return False
    return True


def device_matches(link: EnrollmentShareLink, fingerprint: str) -> bool:
    locked = (link.device_fingerprint or "").strip()
    if not locked:
        return True  # not yet bound
    return hmac.compare_digest(locked, fingerprint)


# ── video source resolution (server-side only) ──────────────────────────────

def is_youtube_like(url: str | None) -> bool:
    value = (url or "").lower()
    return "youtube.com" in value or "youtu.be" in value


async def resolve_stream_upstream(request: Request, link: EnrollmentShareLink) -> Optional[str]:
    """Resolve the link's ``video_source`` into an upstream URL to proxy.

    * bare R2 object key (no scheme) → short-lived presigned GET URL
    * an R2 public URL → extract key + presign
    * any other http(s) URL → used directly
    * a local '/...' path → absolute URL against this request
    Returns None when nothing usable is configured.
    """
    source = (link.video_source or "").strip()
    if not source:
        return None
    if is_youtube_like(source):
        return None

    # R2 public URL → key
    key = r2_storage.r2_key_from_url(source)
    if key is None and not _HAS_SCHEME_RE.match(source) and not source.startswith("/"):
        # treat as a bare R2 object key
        key = source.lstrip("/")

    if key and r2_storage.r2_enabled():
        try:
            return await r2_storage.presign_get_url(key=key, expires_seconds=120)
        except Exception:
            return None

    if _HAS_SCHEME_RE.match(source):
        return source

    if source.startswith("/"):
        base = str(request.base_url).rstrip("/")
        return f"{base}{source}"

    return None
