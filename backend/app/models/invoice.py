from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Invoice(Base):
    """Tax invoices (lead claims) and payment receipts (recharges, positive adjustments)."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        comment="tax_invoice | payment_receipt",
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        server_default=text("'INR'"),
        default="INR",
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    wallet_recharge_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("wallet_recharges.id"),
        unique=True,
        nullable=True,
    )
    wallet_ledger_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("wallet_ledger_entries.id"),
        unique=True,
        nullable=True,
    )
    crm_claim_idempotency_key: Mapped[Optional[str]] = mapped_column(String(160), unique=True, nullable=True)
