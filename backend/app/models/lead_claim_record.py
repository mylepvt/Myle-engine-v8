from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeadClaimRecord(Base):
    """One row each time a lead is handed to a member: paid from the pool, free from the
    pool (price ₹0), or given free by an admin. The paid and free records leaders and
    reports read, kept apart from the activity log."""

    __tablename__ = "lead_claim_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    lead_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # "paid" | "free"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # "pool" (paid claim) | "free_pool" (₹0 pool lead) | "admin_gift" (given free by admin) | "booking"
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    reason: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    given_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    refunded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
