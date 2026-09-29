"""Post-unlock "Skills & Personal Development" training track.

Separate from the 7-day onboarding catalog (``training_videos``) so adding
skills lessons never changes what a new member must finish to unlock the app.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SkillTrainingVideo(Base):
    __tablename__ = "skill_training_videos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    day_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    youtube_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class SkillTrainingProgress(Base):
    __tablename__ = "skill_training_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "day_number", name="uq_skill_training_progress_user_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
