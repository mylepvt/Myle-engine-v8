"""Myle Bridge: leads.external_ref + ledger_bridge_outbox

Revision ID: 20261020_0100
Revises: 20261018_0200
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261020_0100"
down_revision: Union[str, Sequence[str], None] = "20261018_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("external_ref", sa.String(length=200), nullable=True))
    op.create_unique_constraint("uq_leads_external_ref", "leads", ["external_ref"])
    op.create_table(
        "ledger_bridge_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "payload",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
    )
    op.create_index("ix_ledger_bridge_outbox_status", "ledger_bridge_outbox", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ledger_bridge_outbox_status", table_name="ledger_bridge_outbox")
    op.drop_table("ledger_bridge_outbox")
    op.drop_constraint("uq_leads_external_ref", "leads", type_="unique")
    op.drop_column("leads", "external_ref")
