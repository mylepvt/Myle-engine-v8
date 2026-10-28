"""Daily text: one admin-written message per calendar day, shown at the top of Home."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyText(Base):
    __tablename__ = "daily_texts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # IST calendar day the message belongs to; one message per day.
    text_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    # Short line shown on the Home card (quote / theme).
    headline: Mapped[str] = mapped_column(String(300), nullable=False)
    # Full message, opened from the card.
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
