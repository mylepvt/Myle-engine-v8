from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GraceHistory(Base):
    """Immutable record of each grace lifecycle event (request → outcome)."""

    __tablename__ = "grace_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Snapshot captured at request time (null for admin-direct grants)
    requested_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    requested_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    request_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    calls_streak_at_request: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    report_streak_at_request: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Outcome
    # "approved" | "rejected" | "auto_restored" | "auto_removed" | "cleared"
    outcome: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    outcome_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    final_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    action_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
