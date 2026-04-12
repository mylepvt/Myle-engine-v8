"""Persisted default price for new lead-pool rows (admin-controlled)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

APP_KEY_LEAD_POOL_DEFAULT_PRICE_CENTS = "lead_pool_default_price_cents"


async def get_default_pool_price_cents(session: AsyncSession) -> int:
    r = await session.execute(
        select(AppSetting.value).where(AppSetting.key == APP_KEY_LEAD_POOL_DEFAULT_PRICE_CENTS)
    )
    raw = r.scalar_one_or_none()
    if raw is None or str(raw).strip() == "":
        return 0
    try:
        return max(0, int(str(raw).strip()))
    except ValueError:
        return 0
