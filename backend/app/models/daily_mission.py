from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MissionTemplate(Base):
    """Admin-defined daily mission template for each role."""

    __tablename__ = "mission_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="team",
        comment="team | leader"
    )
    # JSON array of items: [{"key":"invitations","label":"Invitations","target":10,"evidence_required":true}, ...]
    items: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True,
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class DailyMission(Base):
    """Per-member, per-day mission instance."""

    __tablename__ = "daily_missions"
    __table_args__ = (
        UniqueConstraint("user_id", "mission_date", name="uq_daily_missions_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    mission_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    template_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("mission_templates.id", ondelete="SET NULL"), nullable=True,
    )
    # JSON: {"invitations": {"target": 10, "achieved": 5, "done": false, "evidence": null, "evidence_file": null}, ...}
    items: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    completion_pct: Mapped[float] = mapped_column(
        Float, nullable=False, server_default=text("0"), default=0.0,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'"), default="pending",
        comment="pending | completed | incomplete",
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class MissionBlocker(Base):
    """Captures why a member did not complete their mission."""

    __tablename__ = "mission_blockers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    daily_mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("daily_missions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    reason: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="fear | no_prospects | no_time | technical_issue | didnt_understand | other",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
