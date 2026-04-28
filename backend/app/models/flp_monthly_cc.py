from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FLPMonthlyCC(Base):
    """Pre-computed monthly CC rollup per user — one row per user per month."""

    __tablename__ = "flp_monthly_cc"
    __table_args__ = (UniqueConstraint("user_id", "year_month", name="uq_flp_monthly_cc_user_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    personal_cc: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    group_cc: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_cc: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Active = total_cc >= 4 AND personal_cc >= 1 (FLP active status rule)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
