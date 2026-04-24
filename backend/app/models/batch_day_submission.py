from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BatchDaySubmission(Base):
    __tablename__ = "batch_day_submissions"
    __table_args__ = (UniqueConstraint("lead_id", "slot", name="uq_batch_day_submissions_lead_slot"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_share_link_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("batch_share_links.id", ondelete="SET NULL"), nullable=True, index=True
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    slot: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    notes_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_note_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
