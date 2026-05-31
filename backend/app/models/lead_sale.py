"""FLP CC/sale billing record — one row per (lead, billing_stage).

Captures a FOREVER Tax Invoice tied to a lead's Day 3 or Day 6 billing. Case
Credits (``case_credits``, e.g. 1.002) and the invoice rupee total are the two
metrics rolled up on the scoped CC dashboards. ``status`` follows the same
pending/approved/rejected lifecycle as payment proofs; ``auto_verified`` marks
records the OCR engine approved without admin touch (hybrid policy).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeadSale(Base):
    """A single CC/sale billing event for a lead (Day 3 or Day 6)."""

    __tablename__ = "lead_sales"
    __table_args__ = (
        # One sale record per stage per lead — re-upload updates the same row.
        UniqueConstraint("lead_id", "billing_stage", name="uq_lead_sale_stage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id"), nullable=False, index=True
    )
    # 'day3' (first billing) | 'day6' (closing billing)
    billing_stage: Mapped[str] = mapped_column(String(8), nullable=False)

    # ── Invoice metrics (from FOREVER Tax Invoice) ────────────────────────────
    case_credits: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(7, 3), nullable=True
    )
    amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )
    fbo_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sponsor_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    order_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # ── Proof + OCR audit ─────────────────────────────────────────────────────
    proof_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ocr_confidence: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(4, 3), nullable=True
    )
    ocr_raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auto_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
    verify_notes: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'pending'"),
        default="pending",
        index=True,
    )
    submitted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    # Sticky owner snapshot — drives scoped CC dashboards without re-resolving.
    owner_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )
    approved_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
