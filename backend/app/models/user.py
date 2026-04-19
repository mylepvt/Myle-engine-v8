from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Globally unique — primary sign-in identifier (case-insensitive; stored lowercase).
    fbo_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # Display / social handle — optional; case-insensitive uniqueness when set (enforced in DB + register).
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
    # Legacy ``users.status`` — pending until admin approves self-serve registration.
    registration_status: Mapped[str] = mapped_column(
        "status",
        String(32),
        nullable=False,
        server_default=text("'approved'"),
        default="approved",
    )
    phone: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True)
    training_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    training_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'not_required'"),
        default="not_required",
    )
    access_blocked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    discipline_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'active'"),
        default="active",
    )
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Public URL path served by GET /api/v1/media/avatar/{id} (set after upload).
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # base64 data URL or legacy path
    joining_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Training certificate — uploaded by trainee after all 7 days done; unlocks full dashboard.
    certificate_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # XP / gamification columns (added in migration 0031)
    xp_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    xp_level: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'rookie'"), default="rookie")
    login_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    last_login_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Season tracking — which year/month this user's xp_total belongs to (migration 0032)
    xp_season_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    xp_season_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

