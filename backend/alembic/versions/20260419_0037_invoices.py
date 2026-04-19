"""invoices table + app_settings invoice counter seed

Revision ID: 20260419_0037
Revises: 20260419_0036
Create Date: 2026-04-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260419_0037"
down_revision: Union[str, Sequence[str], None] = "20260419_0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("invoice_number", sa.String(length=32), nullable=False),
        sa.Column("doc_type", sa.String(length=24), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'INR'"), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "payload_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("wallet_recharge_id", sa.Integer(), nullable=True),
        sa.Column("wallet_ledger_entry_id", sa.Integer(), nullable=True),
        sa.Column("crm_claim_idempotency_key", sa.String(length=160), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["wallet_recharge_id"], ["wallet_recharges.id"]),
        sa.ForeignKeyConstraint(["wallet_ledger_entry_id"], ["wallet_ledger_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_number"),
        sa.UniqueConstraint("wallet_recharge_id"),
        sa.UniqueConstraint("wallet_ledger_entry_id"),
        sa.UniqueConstraint("crm_claim_idempotency_key"),
    )
    op.create_index("ix_invoices_user_issued", "invoices", ["user_id", "issued_at"], unique=False)

    op.execute(
        """
        INSERT INTO app_settings (key, value)
        SELECT 'invoice_counter', '{"year": 0, "seq": 0}'
        WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'invoice_counter')
        """
    )


def downgrade() -> None:
    op.drop_index("ix_invoices_user_issued", table_name="invoices")
    op.drop_table("invoices")
    op.execute("DELETE FROM app_settings WHERE key = 'invoice_counter'")
