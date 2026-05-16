from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MemberRemovalOutreach(Base):
    __tablename__ = "member_removal_outreach"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    member_name: Mapped[str] = mapped_column(String(255), nullable=False)
    removal_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Outbound message state
    send_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )  # "pending" | "sent" | "failed" | "stub"
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    send_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manual_share_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Inbound reply
    reply_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    wa_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), default=func.now()
    )
