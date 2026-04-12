from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (
        UniqueConstraint("user_id", "report_date", name="uq_daily_reports_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_calling: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    calls_picked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wrong_numbers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enrollments_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_enroll: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    underage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    plan_2cc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seat_holdings: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leads_educated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pdf_covered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    videos_sent_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    calls_made_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payments_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    system_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
