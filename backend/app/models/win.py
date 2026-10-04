"""Team wins feed: enrollments, conversions, level-ups and streak milestones
anyone on the team can see and cheer (social proof + recognition)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Win(Base):
    __tablename__ = "wins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # enrollment | conversion | level_up | streak
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # level name for level_up, day count for streak; never a lead's name
    detail: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class WinCheer(Base):
    __tablename__ = "win_cheers"
    __table_args__ = (UniqueConstraint("win_id", "user_id", name="uq_win_cheers_win_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    win_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("wins.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
