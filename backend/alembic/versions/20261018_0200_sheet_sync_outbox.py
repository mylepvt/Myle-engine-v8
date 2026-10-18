"""Google Sheet lead-status sync outbox

Revision ID: 20261018_0200
Revises: 20261018_0100
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261018_0200"
down_revision: Union[str, Sequence[str], None] = "20261018_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sheet_sync_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Integer(), nullable=False),
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
    op.create_index("ix_sheet_sync_outbox_lead_id", "sheet_sync_outbox", ["lead_id"])
    op.create_index("ix_sheet_sync_outbox_status", "sheet_sync_outbox", ["status"])


def downgrade() -> None:
    op.drop_index("ix_sheet_sync_outbox_status", table_name="sheet_sync_outbox")
    op.drop_index("ix_sheet_sync_outbox_lead_id", table_name="sheet_sync_outbox")
    op.drop_table("sheet_sync_outbox")
