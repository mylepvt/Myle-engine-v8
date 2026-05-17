"""Tracks WhatsApp report reminders sent to members who haven't submitted daily reports."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReportReminderOutreach(Base):
    __tablename__ = "report_reminder_outreach"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reminder_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    member_name: Mapped[str] = mapped_column(String(255), nullable=False)
    send_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    send_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    wa_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow())
