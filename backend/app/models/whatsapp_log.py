from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WhatsAppLog(Base):
    __tablename__ = "whatsapp_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=func.now(),
    )
    direction: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    message_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    message_preview: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wa_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    related_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
