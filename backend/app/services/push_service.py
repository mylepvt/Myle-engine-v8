"""Web Push notification service.

Gracefully degrades if pywebpush/cryptography are not installed.
Push failures NEVER raise — they are logged and swallowed.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.push_subscription import PushSubscription
from app.models.user import User

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

def _do_webpush(sub: PushSubscription, data: str, private_pem: str) -> bool:
    """Send a single push. Returns True on success, False on failure."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
            },
            data=data,
            vapid_private_key=private_pem,
            vapid_claims={"sub": "mailto:admin@mylecommunity.com"},
        )
        return True
    except Exception as exc:  # noqa: BLE001
        # Check for WebPushException specifically when available
        status_code: int | None = None
        if _PUSH_AVAILABLE:
            try:
                if isinstance(exc, WebPushException) and exc.response is not None:
                    status_code = exc.response.status_code
            except Exception:  # noqa: BLE001
                pass
        logger.warning("Push send failed (status=%s): %s", status_code, exc)
        return False


async def _send_and_cleanup(
    session: AsyncSession,
    subs: list[PushSubscription],
    data: str,
    private_pem: str,
) -> int:
    """Send to list of subscriptions; delete stale ones. Returns success count."""
    ok_count = 0
    stale_ids: list[int] = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
                },
                data=data,
                vapid_private_key=private_pem,
                vapid_claims={"sub": "mailto:admin@mylecommunity.com"},
            )
            ok_count += 1
        except Exception as exc:  # noqa: BLE001
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
    """Send push to all subscriptions for user_id. Returns success count."""
    if not _PUSH_AVAILABLE:
        return 0
    try:
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
    """Send push to all subscribed users with the given role."""
    if not _PUSH_AVAILABLE:
        return 0
    try:
        private_pem, _ = await _get_or_create_vapid_keys(session)
        # Join users to subscriptions filtered by role
        user_ids_result = await session.execute(
            select(User.id).where(User.role == role)
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
                    User.role.in_(role_list),
                    User.registration_status == "approved",
                    User.access_blocked.is_(False),
                    User.discipline_status == "active",
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
    """Send push to all non-admin subscribed users."""
    if not _PUSH_AVAILABLE:
        return 0
    try:
        private_pem, _ = await _get_or_create_vapid_keys(session)
        non_admin_ids = (
            await session.execute(
                select(User.id).where(User.role != "admin")
            )
        ).scalars().all()
        if not non_admin_ids:
            return 0
        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id.in_(list(non_admin_ids)))
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
