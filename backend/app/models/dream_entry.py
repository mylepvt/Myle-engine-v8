from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DreamEntry(Base):
    """One dream record per user — upserted, not append-only."""

    __tablename__ = "dream_entries"
    __table_args__ = (UniqueConstraint("user_id", name="uq_dream_entries_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # income | time_freedom | family | home | travel | business | other
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    dream_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional target date — gives the countdown anchor
    target_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Optional image URL (external link or /api/v1/media upload path)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
