"""CardDAV sync credentials for admins.

The iPhone stores a dedicated sync password (never the admin's login password).
Only a SHA-256 of it is kept in app_settings; generating a new one replaces the old,
and turning sync off deletes it.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.user import User

_KEY = "carddav_admin:{user_id}"
_USER_RE = re.compile(r"^myle-admin-(\d+)$")


def carddav_username(user_id: int) -> str:
    return f"myle-admin-{user_id}"


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def carddav_enabled(session: AsyncSession, user_id: int) -> bool:
    row = await session.get(AppSetting, _KEY.format(user_id=user_id))
    return bool(row and row.value)


async def issue_carddav_password(session: AsyncSession, user_id: int) -> str:
    # Grouped for easy typing on the iPhone: xxxx-xxxx-xxxx-xxxx-xxxx
    raw = secrets.token_hex(10)
    password = "-".join(raw[i : i + 4] for i in range(0, 20, 4))
    key = _KEY.format(user_id=user_id)
    row = await session.get(AppSetting, key)
    if row is None:
        session.add(AppSetting(key=key, value=_hash(password)))
    else:
        row.value = _hash(password)
    await session.commit()
    return password


async def disable_carddav(session: AsyncSession, user_id: int) -> None:
    row = await session.get(AppSetting, _KEY.format(user_id=user_id))
    if row is not None:
        await session.delete(row)
        await session.commit()


async def authenticate_carddav(session: AsyncSession, username: str, password: str) -> User | None:
    """The admin behind a valid username + sync password, else None."""
    m = _USER_RE.match((username or "").strip())
    if m is None:
        return None
    user_id = int(m.group(1))
    row = await session.get(AppSetting, _KEY.format(user_id=user_id))
    if row is None or not row.value:
        return None
    if not hmac.compare_digest(row.value, _hash((password or "").strip().lower())):
        return None
    user = await session.get(User, user_id)
    if user is None or user.role != "admin" or user.removed_at is not None:
        return None
    return user
