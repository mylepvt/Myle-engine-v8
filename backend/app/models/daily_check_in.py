from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyCheckIn(Base):
    """One session row per check-in. Multiple sessions per user per day are allowed."""

    __tablename__ = "daily_check_ins"
    __table_args__ = ()

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Check-in
    check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accuracy_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Check-out (nullable until user checks out)
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checkout_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    checkout_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    checkout_accuracy_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Activity heartbeat — updated every ~15 min while user is in the app
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Computed at checkout
    work_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Flags
    is_suspicious: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
