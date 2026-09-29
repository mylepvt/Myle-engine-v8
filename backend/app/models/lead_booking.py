"""Lead booking — a member reserves N pool leads for a given IST day.

When the admin loads leads into the paid pool, open bookings for that day are
auto-filled FIFO (wallet-debited, same as a manual claim).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

BOOKING_OPEN = "open"
BOOKING_FULFILLED = "fulfilled"
BOOKING_CANCELLED = "cancelled"
BOOKING_EXPIRED = "expired"


class LeadBooking(Base):
    __tablename__ = "lead_bookings"
    __table_args__ = (UniqueConstraint("user_id", "booking_date", name="uq_lead_booking_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    booking_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    requested_count: Mapped[int] = mapped_column(Integer, nullable=False)
    fulfilled_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=BOOKING_OPEN)
    # Why the last auto-fill attempt stopped short (e.g. low wallet / uncovered leads).
    last_skip_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
