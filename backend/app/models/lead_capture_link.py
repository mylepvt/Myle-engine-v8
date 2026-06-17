from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeadCaptureLink(Base):
    """A member's personal public capture link.

    The owner picks a category (see ``app.core.capture_categories``) and shares the
    public URL ``/c/{token}``. Each prospect who submits the public form creates a
    ``Lead`` owned by ``owner_user_id`` with ``source`` set to ``category``.
    """

    __tablename__ = "lead_capture_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # Member-uploaded poster (their own design) with the QR/link overlaid, saved server-side.
    poster_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    leads_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"), default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
