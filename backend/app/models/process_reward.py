"""Process rewards: MYLE Points (MP) earned on verified process steps, and the daily jackpot.

Points never turn into money directly — they buy jackpot tickets (see
app/services/process_rewards.py).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProcessPoint(Base):
    """One verified step on one lead. (lead_id, step) is unique → a step pays once."""

    __tablename__ = "process_points"
    __table_args__ = (UniqueConstraint("lead_id", "step", name="uq_process_points_lead_step"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lead_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # e.g. "video_watched", "d1_morning", "day2_test_passed", "connected_call:2026-10-06"
    step: Mapped[str] = mapped_column(String(48), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # "proof_gone" | "lead_deleted" | "own_number" | "admin"
    revoked_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


class JackpotDraw(Base):
    """Daily 21:00 IST draw. No tickets → no winner, and the pot rolls over to the next day."""

    __tablename__ = "jackpot_draws"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    draw_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    pot_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    winner_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    tickets_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    players: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
