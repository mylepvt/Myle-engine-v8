"""Allocate sequential invoice numbers MYL-{IST year}-{seq:04d} stored in app_settings."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import now_ist
from app.models.app_setting import AppSetting


async def allocate_invoice_number(session: AsyncSession) -> str:
    year = now_ist().year
    stmt = select(AppSetting).where(AppSetting.key == "invoice_counter").with_for_update()
    res = await session.execute(stmt)
    row = res.scalar_one_or_none()
    if row is None:
        row = AppSetting(key="invoice_counter", value=json.dumps({"year": 0, "seq": 0}))
        session.add(row)
        await session.flush()

    try:
        data = json.loads(row.value or "{}")
    except json.JSONDecodeError:
        data = {"year": 0, "seq": 0}
    cy = int(data.get("year") or 0)
    seq = int(data.get("seq") or 0)
    if cy != year:
        cy = year
        seq = 0
    seq += 1
    row.value = json.dumps({"year": cy, "seq": seq})
    await session.flush()
    return f"MYL-{cy}-{seq:04d}"
