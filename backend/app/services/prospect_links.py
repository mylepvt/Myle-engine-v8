"""Prospect links (Day 1/2 batch videos, Day 2 business test) are for that one lead only.

* **Lead's own number** — the link opens only after the lead's registered mobile is entered.
* **Locked to the phone that opened it** — a forwarded copy won't open on someone else's phone.
  Up to ``MAX_DEVICES`` browsers are allowed so WhatsApp's in-app browser + Chrome both work.
* **2-hour life** — a link must be opened within 2 hours of being generated; a prospect who
  opened it in time gets ``FINISH_GRACE`` more to finish watching.
* **Not on a Myle login** — a browser signed in to Myle is staff, so it can't unlock or tick
  the prospect's progress.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Request, Response

from app.core.auth_cookie import MYLE_ACCESS_COOKIE, MYLE_REFRESH_COOKIE
from app.core.config import settings
from app.models.lead import Lead
from app.services.flp_min_billing_video import normalize_phone_for_match

LINK_TTL = timedelta(hours=2)
FINISH_GRACE = timedelta(hours=2)
MAX_DEVICES = 2
DEVICE_COOKIE = "myle_prospect_device"
_DEVICE_COOKIE_MAX_AGE = 365 * 24 * 3600

EXPIRED_MESSAGE = "This link has expired. Ask your coach to send you a new one."
WRONG_PHONE_MESSAGE = "Enter the mobile number this link was sent to."
OTHER_DEVICE_MESSAGE = (
    "This link is already open on another phone. Ask your coach to send you a new one."
)
STAFF_MESSAGE = (
    "This link is only for the prospect. It can't be opened while you're logged in to Myle."
)


class ProspectLinkError(Exception):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def link_expires_at(created_at: datetime) -> datetime:
    return _aware(created_at) + LINK_TTL


def is_expired(created_at: datetime, *, now: datetime | None = None) -> bool:
    return (now or datetime.now(timezone.utc)) >= link_expires_at(created_at)


def can_still_finish(created_at: datetime, *, now: datetime | None = None) -> bool:
    return (now or datetime.now(timezone.utc)) < link_expires_at(created_at) + FINISH_GRACE


def is_staff_browser(request: Request) -> bool:
    return bool(request.cookies.get(MYLE_ACCESS_COOKIE) or request.cookies.get(MYLE_REFRESH_COOKIE))


def phone_matches(lead: Lead, raw_phone: str | None) -> bool:
    expected = normalize_phone_for_match(lead.phone)
    return expected is not None and normalize_phone_for_match(raw_phone) == expected


def _device_hash(device_id: str) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"), device_id.encode("utf-8"), hashlib.sha256
    ).hexdigest()[:32]


def device_id(request: Request) -> str | None:
    raw = (request.cookies.get(DEVICE_COOKIE) or "").strip()
    return raw or None


def ensure_device_cookie(request: Request, response: Response) -> str:
    """This browser's device id, minted on first use (HttpOnly, so a page can't copy it)."""
    existing = device_id(request)
    if existing:
        return existing
    new_id = secrets.token_urlsafe(24)
    response.set_cookie(
        key=DEVICE_COOKIE,
        value=new_id,
        max_age=_DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )
    return new_id


def is_bound(bound: list[str] | None, device: str | None) -> bool:
    return bool(device) and _device_hash(device) in (bound or [])


def bind_device(bound: list[str] | None, device: str) -> list[str]:
    """Add this device to the link's allow-list, or refuse once the list is full."""
    current = list(bound or [])
    h = _device_hash(device)
    if h in current:
        return current
    if len(current) >= MAX_DEVICES:
        raise ProspectLinkError(OTHER_DEVICE_MESSAGE, 403)
    return [*current, h]


def unlock(
    request: Request,
    response: Response,
    *,
    lead: Lead,
    created_at: datetime,
    bound: list[str] | None,
    phone: str | None,
) -> list[str]:
    """Check everything a prospect must pass to open a link; return the new allow-list."""
    if is_staff_browser(request):
        raise ProspectLinkError(STAFF_MESSAGE, 403)
    device = device_id(request)
    if is_bound(bound, device):
        return list(bound or [])
    if is_expired(created_at):
        raise ProspectLinkError(EXPIRED_MESSAGE, 410)
    if not phone_matches(lead, phone):
        raise ProspectLinkError(WRONG_PHONE_MESSAGE, 403)
    return bind_device(bound, device or ensure_device_cookie(request, response))
