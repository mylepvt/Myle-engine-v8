"""Uploaded file bytes kept in Postgres.

Render's container disk is wiped on every deploy/restart and R2 is not
configured in production, so proofs, invoices, avatars, training notes etc.
written to disk vanished ("Not found" on View proof / View invoice). When R2 is
off, uploads are stored here and served from /api/v1/media/... instead.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MediaBlob(Base):
    __tablename__ = "media_blobs"
    __table_args__ = (UniqueConstraint("kind", "name", name="uq_media_blobs_kind_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # e.g. "payment-proofs", "sale-invoices", "avatar", "training-notes"
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
