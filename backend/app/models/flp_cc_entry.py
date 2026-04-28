from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FLPCCEntry(Base):
    """Append-only ledger of CC (Case Credit) purchase events per user."""

    __tablename__ = "flp_cc_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # YYYY-MM — the FLP business month this CC belongs to
    year_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    cc_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # personal = user's own purchase; group = counted from downline toward user's group CC
    entry_type: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="personal", default="personal"
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
