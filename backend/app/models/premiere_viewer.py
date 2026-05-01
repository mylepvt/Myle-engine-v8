from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PremiereViewer(Base):
    __tablename__ = "premiere_viewers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    viewer_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    session_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD IST

    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    city: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(30), nullable=False, default="")

    joined_waiting: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), default=False)
    first_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    current_time_sec: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"), default=0.0)
    percentage_watched: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"), default=0.0)
    watch_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), default=False)
    rejoined: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), default=False)

    lead_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
