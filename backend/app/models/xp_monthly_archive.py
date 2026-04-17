from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class XpMonthlyArchive(Base):
    __tablename__ = "xp_monthly_archive"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_xp_archive_user_year_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    final_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    final_level: Mapped[str] = mapped_column(String(32), nullable=False, default="rookie")
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
