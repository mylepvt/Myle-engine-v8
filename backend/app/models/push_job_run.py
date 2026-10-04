from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushJobRun(Base):
    """One run of a scheduled notification job: who it was meant for, who it reached."""

    __tablename__ = "push_job_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    ran_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    targeted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # members it tried to notify
    sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # reached at least one device
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
