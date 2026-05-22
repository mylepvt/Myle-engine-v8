from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


_InboundJSON = JSON().with_variant(JSONB(), "postgresql")


class WhatsAppInboundMessage(Base):
    __tablename__ = "whatsapp_inbound_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="meta_cloud_api")
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    phone_digits: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    profile_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message_type: Mapped[str] = mapped_column(String(64), nullable=False, default="text")
    message_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    command_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    wa_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    reply_to_wa_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    matched_lead_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    matched_user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    matched_removal_outreach_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("member_removal_outreach.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    raw_payload: Mapped[Optional[Any]] = mapped_column(_InboundJSON, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=func.now(),
        index=True,
    )
