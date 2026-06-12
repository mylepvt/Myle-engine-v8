from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


TASK_TYPE_CHOICES = (
    "LEAD_GENERATION",
    "INVITATION",
    "FOLLOWUP",
    "CALLING",
    "TRAINING",
    "IMPLEMENTATION",
    "COACHING",
    "AUDIT",
    "CUSTOM",
)


class VerificationTask(Base):
    __tablename__ = "verification_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="CUSTOM",
    )
    evidence_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
        default=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
