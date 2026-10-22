"""Write the paid / free lead records (``lead_claim_records``) at each hand-over."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead_claim_record import LeadClaimRecord


def record_claim(
    session: AsyncSession,
    *,
    user_id: int,
    lead_id: int,
    price_cents: int,
    source: str | None = None,
    reason: str | None = None,
    given_by_user_id: int | None = None,
) -> None:
    """Inside the caller's transaction. A lead with a price is paid; ₹0 or an admin gift is free."""
    price = max(0, int(price_cents or 0))
    if given_by_user_id is not None:
        src = "admin_gift"
    elif price == 0:
        src = "free_pool"
    else:
        src = source if source == "booking" else "pool"
    session.add(
        LeadClaimRecord(
            user_id=user_id,
            lead_id=lead_id,
            kind="paid" if price > 0 else "free",
            source=src,
            price_cents=price,
            reason=(reason or None) and reason[:64],
            given_by_user_id=given_by_user_id,
            claimed_at=datetime.now(timezone.utc),
        )
    )


async def mark_refunded(session: AsyncSession, *, user_id: int, lead_id: int, refund_cents: int) -> None:
    """The member's latest unrefunded paid record for this lead gets the refund."""
    row = (
        await session.execute(
            select(LeadClaimRecord)
            .where(
                LeadClaimRecord.user_id == user_id,
                LeadClaimRecord.lead_id == lead_id,
                LeadClaimRecord.refunded_at.is_(None),
            )
            .order_by(LeadClaimRecord.claimed_at.desc(), LeadClaimRecord.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is not None:
        row.refunded_at = datetime.now(timezone.utc)
        row.refund_cents = int(refund_cents)
