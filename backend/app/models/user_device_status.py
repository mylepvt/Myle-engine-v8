from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserDeviceStatus(Base):
    """Latest app setup a member reported: installed app vs browser, push permission."""

    __tablename__ = "user_device_status"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="desktop")  # ios|android|desktop
    standalone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # opened from home screen
    push_permission: Mapped[str] = mapped_column(String(16), nullable=False, default="default")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
