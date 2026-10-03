"""Web Push notification service.

Gracefully degrades if pywebpush/cryptography are not installed.
Push failures NEVER raise — they are logged and swallowed.
"""
from __future__ import annotations

import asyncio
import base64
import functools
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.models.app_setting import AppSetting
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.report_eligibility import report_eligibility_conditions

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports — degrade gracefully in dev before pip install
# ---------------------------------------------------------------------------
try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        NoEncryption,
        PrivateFormat,
        PublicFormat,
    )
    from py_vapid import Vapid01
    from pywebpush import WebPushException, webpush

    _PUSH_AVAILABLE = True
except ImportError:
    _PUSH_AVAILABLE = False
    logger.warning("pywebpush/cryptography not installed — push notifications disabled")


# ---------------------------------------------------------------------------
# VAPID key helpers
# ---------------------------------------------------------------------------

def _generate_vapid_keys() -> tuple[str, str]:
    """Return (private_pem_str, public_b64url_str)."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
    ).decode()
    public_bytes = private_key.public_key().public_bytes(
        Encoding.X962, PublicFormat.UncompressedPoint
    )
    public_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode()
    return private_pem, public_b64


async def _get_or_create_vapid_keys(session: AsyncSession) -> tuple[str, str]:
    """Return (private_pem, public_b64url), generating and persisting if absent."""
    pub_row = (
        await session.execute(
            select(AppSetting.value).where(AppSetting.key == "vapid_public_key")
        )
    ).scalar_one_or_none()
    priv_row = (
        await session.execute(
            select(AppSetting.value).where(AppSetting.key == "vapid_private_pem")
        )
    ).scalar_one_or_none()

    if pub_row and priv_row:
        return str(priv_row), str(pub_row)

    # Generate new pair
    private_pem, public_b64 = _generate_vapid_keys()

    # Upsert both keys
    for key, value in (("vapid_private_pem", private_pem), ("vapid_public_key", public_b64)):
        existing = await session.get(AppSetting, key)
        if existing is None:
            session.add(AppSetting(key=key, value=value))
        else:
            existing.value = value

    await session.commit()
    return private_pem, public_b64


async def get_vapid_public_key(session: AsyncSession) -> str:
    """Return the VAPID public key (base64url), generating if needed."""
    if not _PUSH_AVAILABLE:
        return ""
    _, public_b64 = await _get_or_create_vapid_keys(session)
    return public_b64


# ---------------------------------------------------------------------------
# Send helpers
# ---------------------------------------------------------------------------

@functools.lru_cache(maxsize=4)
def _vapid_signer(private_pem: str) -> "Vapid01":
    """VAPID signer from the stored PEM.

    pywebpush treats a *string* key as base64url DER, so passing the PEM text
    raised "Could not deserialize key data" on every send — no push was ever
    delivered. Hand it a parsed ``Vapid01`` instead.
    """
    return Vapid01.from_pem(private_pem.encode())


# Concurrent sends per batch. Each send is a blocking HTTPS call, so it runs in a
# worker thread — calling it inline froze the event loop (every API request) for
# the length of a digest run.
_PUSH_SEND_CONCURRENCY = 8


def _webpush_sync(sub_info: dict[str, Any], data: str, private_pem: str) -> BaseException | None:
    """Blocking send — run via ``asyncio.to_thread``. Returns the error instead of raising."""
    try:
        webpush(
            subscription_info=sub_info,
            data=data,
            vapid_private_key=_vapid_signer(private_pem),
            vapid_claims={"sub": "mailto:admin@mylecommunity.com"},
        )
        return None
    except Exception as exc:  # noqa: BLE001
        return exc


async def _send_and_cleanup(
    session: AsyncSession,
    subs: list[PushSubscription],
    data: str,
    private_pem: str,
) -> int:
    """Send to list of subscriptions; delete stale ones. Returns success count."""
    sem = asyncio.Semaphore(_PUSH_SEND_CONCURRENCY)

    async def _send(sub: PushSubscription) -> BaseException | None:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
        }
        async with sem:
            return await asyncio.to_thread(_webpush_sync, sub_info, data, private_pem)

    results = await asyncio.gather(*(_send(sub) for sub in subs))

    ok_count = 0
    stale_ids: list[int] = []
    for sub, exc in zip(subs, results):
        if exc is None:
            ok_count += 1
            continue
        stale = False
        if _PUSH_AVAILABLE:
            try:
                if isinstance(exc, WebPushException) and exc.response is not None:
                    if exc.response.status_code in (400, 404, 410):
                        stale = True
            except Exception:  # noqa: BLE001
                pass
        if stale:
            stale_ids.append(sub.id)
        else:
            logger.warning("Push send error for sub %s: %s", sub.id, exc)

    # Delete stale subscriptions
    for sub_id in stale_ids:
        row = await session.get(PushSubscription, sub_id)
        if row is not None:
            await session.delete(row)
    if stale_ids:
        await session.commit()

    return ok_count


async def send_push_to_user(
    session: AsyncSession,
    user_id: int,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> int:
    """Send push to all subscriptions for user_id.

    Only sends if user is active (not blocked/removed) and has
    push notifications enabled. Returns success count.
    """
    if not _PUSH_AVAILABLE:
        return 0
    try:
        user = await session.get(User, user_id)
        if user is None:
            return 0
        # Common-sense gate: never push to a removed / blocked account.
        from app.services.messaging_gate import is_account_active
        if not is_account_active(user):
            return 0
        if not user.push_notifications_enabled:
            return 0

        private_pem, _ = await _get_or_create_vapid_keys(session)
        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id == user_id)
            )
        ).scalars().all()
        if not subs:
            return 0
        data = json.dumps({"title": title, "body": body, "url": url})
        return await _send_and_cleanup(session, list(subs), data, private_pem)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_user failed: %s", exc)
        return 0


async def send_push_to_role(
    session: AsyncSession,
    role: str,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> int:
    """Send push to active subscribed users with the given role.

    Filters out blocked/removed users and those with push disabled.
    """
    if not _PUSH_AVAILABLE:
        return 0
    try:
        private_pem, _ = await _get_or_create_vapid_keys(session)
        user_ids_result = await session.execute(
            select(User.id).where(
                *report_eligibility_conditions(today_ist(), roles=(role,)),
                User.push_notifications_enabled.is_(True),
            )
        )
        user_ids = [r for r in user_ids_result.scalars().all()]
        if not user_ids:
            return 0
        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
            )
        ).scalars().all()
        if not subs:
            return 0
        data = json.dumps({"title": title, "body": body, "url": url})
        return await _send_and_cleanup(session, list(subs), data, private_pem)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_role failed: %s", exc)
        return 0


async def send_push_to_roles(
    session: AsyncSession,
    roles: list[str] | tuple[str, ...],
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> int:
    """Send push to active subscribed users across multiple roles."""
    if not _PUSH_AVAILABLE:
        return 0
    role_list = [str(role).strip().lower() for role in roles if str(role).strip()]
    if not role_list:
        return 0
    try:
        private_pem, _ = await _get_or_create_vapid_keys(session)
        user_ids = (
            await session.execute(
                select(User.id).where(
                    *report_eligibility_conditions(today_ist(), roles=role_list),
                    User.push_notifications_enabled.is_(True),
                )
            )
        ).scalars().all()
        if not user_ids:
            return 0
        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id.in_(list(user_ids)))
            )
        ).scalars().all()
        if not subs:
            return 0
        data = json.dumps({"title": title, "body": body, "url": url})
        return await _send_and_cleanup(session, list(subs), data, private_pem)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_roles failed: %s", exc)
        return 0


async def broadcast_push(
    session: AsyncSession,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> int:
    """Send push to active non-admin subscribed users.

    Filters out blocked/removed users and those with push disabled.
    """
    if not _PUSH_AVAILABLE:
        return 0
    try:
        private_pem, _ = await _get_or_create_vapid_keys(session)
        active_ids = (
            await session.execute(
                select(User.id).where(
                    *report_eligibility_conditions(today_ist()),
                    User.push_notifications_enabled.is_(True),
                )
            )
        ).scalars().all()
        if not active_ids:
            return 0
        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id.in_(list(active_ids)))
            )
        ).scalars().all()
        if not subs:
            return 0
        data = json.dumps({"title": title, "body": body, "url": url})
        return await _send_and_cleanup(session, list(subs), data, private_pem)
    except Exception as exc:  # noqa: BLE001
        logger.error("broadcast_push failed: %s", exc)
        return 0


# ---------------------------------------------------------------------------
# Background task helpers (open their own session)
# ---------------------------------------------------------------------------

async def send_push_to_user_bg(
    session_factory: Any,
    user_id: int,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> None:
    """Background-safe push: opens its own DB session."""
    try:
        async with session_factory() as session:
            await send_push_to_user(session, user_id, title=title, body=body, url=url)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_user_bg failed: %s", exc)


async def send_push_to_role_bg(
    session_factory: Any,
    role: str,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> None:
    """Background-safe role push: opens its own DB session."""
    try:
        async with session_factory() as session:
            await send_push_to_role(session, role, title=title, body=body, url=url)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_role_bg failed: %s", exc)


async def send_push_to_roles_bg(
    session_factory: Any,
    roles: list[str] | tuple[str, ...],
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> None:
    """Background-safe multi-role push for active users."""
    try:
        async with session_factory() as session:
            await send_push_to_roles(session, roles, title=title, body=body, url=url)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_push_to_roles_bg failed: %s", exc)
