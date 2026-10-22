from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FreeRechargeRequest(Base):
    """A leader asks admin to credit free (promo) wallet money to themselves or someone in
    their team. Nothing is paid, so it is kept apart from ``wallet_recharges`` (no UTR, no
    receipt, never counted as cash in). Approval writes a "Promo: …" wallet line."""

    __tablename__ = "free_recharge_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The member whose wallet gets the credit (the leader or one of their downline).
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    requested_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=text("'pending'"),
        default="pending",
        index=True,
    )
    admin_note: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
