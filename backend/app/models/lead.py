from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'new_lead'"),
        default="new_lead",
    )
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    in_pool: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    pool_price_cents: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Cost in paise (INR) to claim from pool; NULL = free",
    )

    # Contact info
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ad_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Assignment
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    # Call tracking
    call_status: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        server_default=text("'not_called'"),
        default="not_called",
    )
    call_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    last_called_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    whatsapp_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Payment tracking
    payment_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    payment_amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payment_proof_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    payment_proof_uploaded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Day completion tracking
    day1_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    day2_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    day3_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Workboard batch slots (M/A/E per day — leader/admin Day 1; team Day 2 per blueprint)
    d1_morning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    d1_afternoon: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    d1_evening: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    d2_morning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    d2_afternoon: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    d2_evening: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    no_response_attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )

    # Relationships
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="lead", lazy="dynamic")
