"""Refundable security deposit — the lead's consent, the receipt, and the Ledger outbox.

Kept apart from everything else on purpose: no link to Forever / FLP billing, lead sales,
the wallet, or the GST invoice series (``app.services.deposits``).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# JSONB in Postgres; plain JSON for SQLite tests.
_PayloadJSON = JSON().with_variant(JSONB(), "postgresql")


class DepositConsent(Base):
    """The lead's own e-consent to the deposit, given on a link sent to their WhatsApp.

    The exact terms shown are stored with their hash, plus who agreed (registered mobile
    re-entered, typed full name), when, and from which IP / browser. ``evidence_sha256``
    seals the record; a withdrawal is recorded alongside, never by editing what was given.
    """

    __tablename__ = "deposit_consents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # pending → given → (withdrawn); a pending link can also be cancelled by a newer one.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default=text("'pending'"))
    payer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    payer_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    payer_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    terms_version: Mapped[str] = mapped_column(String(16), nullable=False)
    terms_text: Mapped[str] = mapped_column(Text, nullable=False)
    terms_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    given_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    typed_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    verified_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    evidence_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    withdraw_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    withdraw_user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Given by the lead after agreeing; the welcome email goes here (at most WELCOME_EMAIL_MAX_SENDS).
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    welcome_email_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    welcome_email_sends: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))


class DepositReceipt(Base):
    """Refundable Security Deposit Receipt — not a sale, not a tax invoice, no GST.

    Numbers (``MYLE-DEP-2026-0001``) come from their own counter and are never reused: a
    cancelled receipt keeps its number. ``payload_json`` freezes what the PDF shows.
    """

    __tablename__ = "deposit_receipts"
    __table_args__ = (
        # One live receipt per lead, and one transaction id can't back two live receipts.
        Index(
            "uq_deposit_receipts_live_lead",
            "lead_id",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
            sqlite_where=text("status <> 'cancelled'"),
        ),
        Index(
            "uq_deposit_receipts_live_payment_ref",
            "payment_ref",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
            sqlite_where=text("status <> 'cancelled'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    receipt_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False, index=True)
    consent_id: Mapped[int] = mapped_column(ForeignKey("deposit_consents.id"), nullable=False)
    issued_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(24), nullable=False)
    payment_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    # held → refunded; cancelled when the enrollment proof was sent back.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="held", server_default=text("'held'"), index=True)
    refunded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_ref: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    refund_note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    refunded_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    share_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(_PayloadJSON, nullable=False)


class DepositLedgerOutbox(Base):
    """Deposit records for Myle Ledger's separate Security Deposits book.

    Its own queue and its own Ledger endpoint (``/api/bridge/deposits``), so deposits never
    mix with lead or wallet events. Retried until the Ledger takes them; nothing is dropped.
    """

    __tablename__ = "deposit_ledger_outbox"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    payload: Mapped[dict[str, Any]] = mapped_column(_PayloadJSON, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default=text("'pending'"), index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
