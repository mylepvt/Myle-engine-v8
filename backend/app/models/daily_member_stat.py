from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyMemberStat(Base):
    __tablename__ = "daily_member_stats"
    __table_args__ = (
        UniqueConstraint("user_id", "stat_date", name="uq_daily_member_stats_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stat_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    login_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    calls_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    leads_added_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    followups_done_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    consistency_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    consistency_band: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'low'"),
        default="low",
        index=True,
    )
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

