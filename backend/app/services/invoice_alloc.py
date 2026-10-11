"""Invoice numbers: one gap-free series per document type per Indian financial year (Apr–Mar).

    tax_invoice      MYL-2627-0001
    payment_receipt  RCP-2627-0001
    credit_note      CN-2627-0001

GST wants a consecutive series per document type, unique within the financial year (≤16
characters). Counters live in ``app_settings`` (``invoice_counter:{prefix}:{fy}``) and are
row-locked while a number is taken, so two requests never get the same number and an
aborted transaction gives its number back (the counter rolls back with it).
Older numbers (``MYL-2026-0001`` …, one shared calendar-year counter) stay valid as issued.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import now_ist
from app.models.app_setting import AppSetting

SERIES_PREFIX: dict[str, str] = {
    "tax_invoice": "MYL",
    "payment_receipt": "RCP",
    "credit_note": "CN",
}
# Every format a stored invoice number can have (old shared series + the per-type ones).
INVOICE_NUMBER_PATTERN = r"^(?:MYL|RCP|CN)-\d{4}-\d{4,}$"


def financial_year_token(day: date) -> str:
    """1 Apr 2026 – 31 Mar 2027 → "2627"."""
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


async def _locked_counter(session: AsyncSession, key: str) -> AppSetting:
    stmt = select(AppSetting).where(AppSetting.key == key).with_for_update()
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    try:
        async with session.begin_nested():
            session.add(AppSetting(key=key, value="0"))
    except IntegrityError:
        pass  # another request created it first — lock theirs
    return (await session.execute(stmt)).scalar_one()


async def allocate_invoice_number(session: AsyncSession, doc_type: str = "tax_invoice") -> str:
    prefix = SERIES_PREFIX[doc_type]
    fy = financial_year_token(now_ist().date())
    row = await _locked_counter(session, f"invoice_counter:{prefix}:{fy}")
    seq = int(row.value or 0) + 1
    row.value = str(seq)
    await session.flush()
    return f"{prefix}-{fy}-{seq:04d}"
