"""Durable media bytes stored in the database.

Render's local disk is EPHEMERAL — files written there vanish on every redeploy
or free-plan spin-down, so payment proofs / sale invoices / capture posters
served from ``/api/v1/media/...`` would 404 shortly after upload. When Cloudflare
R2 is not configured we persist the image bytes here instead so the served URLs
keep working across restarts.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MediaBlob(Base):
    """An uploaded image kept in the DB, keyed by its served path suffix."""

    __tablename__ = "media_blobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Path after ``/api/v1/media/`` e.g. ``payment-proofs/proof_42_ab12cd34ef56.jpg``
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
