from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EnrollmentShareLink(Base):
    """Standalone, highly-secured enrollment-video share link.

    Not tied to a Lead. An admin generates one per prospect (name + phone are
    used only for the on-video watermark) and sends the link manually.

    Security model:
      * token         — 256-bit unguessable id in the URL
      * device_fingerprint — bound on first open; later opens from any other
                        device are rejected (first-device lock)
      * max_views / view_count — hard cap (default 1): once consumed the link
                        is dead even on the same device
      * opened_at + expires_at — countdown starts on FIRST open
                        (expires_at = opened_at + window); a never-opened link
                        also dies at created_at + creation cap
    """

    __tablename__ = "enrollment_share_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_by_user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Personalisation for the watermark only.
    viewer_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    viewer_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Video source: R2 object key, R2 public URL, or a direct hosted URL.
    video_source: Mapped[str] = mapped_column(String(600), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        server_default=text("'Enrollment video'"),
        default="Enrollment video",
    )

    # First-device lock.
    device_fingerprint: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    device_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # View cap.
    max_views: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1"), default=1
    )
    view_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"), default=0
    )

    # Lifecycle. expires_at is NULL until first open, then opened_at + window.
    # 18 min — covers the 16:56 enrollment video with ~1-min buffer.
    window_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1080"), default=1080
    )
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    first_viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Hard outer cap for a link that is generated but never opened.
    creation_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
