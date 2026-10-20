"""Refundable security deposits: lead consent, receipts, Myle Ledger outbox

Revision ID: 20261020_0400
Revises: 20261020_0300
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261020_0400"
down_revision: Union[str, Sequence[str], None] = "20261020_0300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "deposit_consents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("payer_name", sa.String(length=200), nullable=False),
        sa.Column("payer_phone", sa.String(length=20), nullable=False),
        sa.Column("payer_city", sa.String(length=100), nullable=True),
        sa.Column("terms_version", sa.String(length=16), nullable=False),
        sa.Column("terms_text", sa.Text(), nullable=False),
        sa.Column("terms_sha256", sa.String(length=64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("given_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("typed_name", sa.String(length=200), nullable=True),
        sa.Column("verified_phone", sa.String(length=20), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("evidence_sha256", sa.String(length=64), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdraw_ip", sa.String(length=64), nullable=True),
        sa.Column("withdraw_user_agent", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_deposit_consents_lead_id", "deposit_consents", ["lead_id"])

    op.create_table(
        "deposit_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("receipt_number", sa.String(length=32), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("consent_id", sa.Integer(), sa.ForeignKey("deposit_consents.id"), nullable=False),
        sa.Column("issued_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payment_mode", sa.String(length=24), nullable=False),
        sa.Column("payment_ref", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'held'")),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refund_ref", sa.String(length=64), nullable=True),
        sa.Column("refund_note", sa.String(length=300), nullable=True),
        sa.Column("refunded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.String(length=300), nullable=True),
        sa.Column("share_token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("payload_json", _JSON, nullable=False),
    )
    op.create_index("ix_deposit_receipts_receipt_number", "deposit_receipts", ["receipt_number"], unique=True)
    op.create_index("ix_deposit_receipts_lead_id", "deposit_receipts", ["lead_id"])
    op.create_index("ix_deposit_receipts_status", "deposit_receipts", ["status"])
    op.create_index(
        "uq_deposit_receipts_live_lead",
        "deposit_receipts",
        ["lead_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled'"),
    )
    op.create_index(
        "uq_deposit_receipts_live_payment_ref",
        "deposit_receipts",
        ["payment_ref"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled'"),
    )

    op.create_table(
        "deposit_ledger_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("payload", _JSON, nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
    )
    op.create_index("ix_deposit_ledger_outbox_status", "deposit_ledger_outbox", ["status"])


def downgrade() -> None:
    op.drop_index("ix_deposit_ledger_outbox_status", table_name="deposit_ledger_outbox")
    op.drop_table("deposit_ledger_outbox")
    for name in (
        "uq_deposit_receipts_live_payment_ref",
        "uq_deposit_receipts_live_lead",
        "ix_deposit_receipts_status",
        "ix_deposit_receipts_lead_id",
        "ix_deposit_receipts_receipt_number",
    ):
        op.drop_index(name, table_name="deposit_receipts")
    op.drop_table("deposit_receipts")
    op.drop_index("ix_deposit_consents_lead_id", table_name="deposit_consents")
    op.drop_table("deposit_consents")
