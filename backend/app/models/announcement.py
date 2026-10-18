"""Org-wide notices (legacy ``announcements`` table parity)."""

from __future__ import annotations

from datetime import datetime

from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False, server_default="")
    pin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Voice notice: the recording lives in media_blobs (kind "notice-audio") under this name.
    audio_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    audio_duration_sec: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
