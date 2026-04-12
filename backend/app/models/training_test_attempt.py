from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TrainingTestAttempt(Base):
    __tablename__ = "training_test_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), default=False)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
