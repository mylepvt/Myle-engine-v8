from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Globally unique — primary sign-in identifier (case-insensitive; stored lowercase).
    fbo_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # Display / social handle — not unique; optional.
    username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Direct upline (parent) in org tree — used for leader downline lead visibility.
    upline_user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
