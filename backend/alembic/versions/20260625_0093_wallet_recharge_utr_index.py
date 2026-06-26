"""Index wallet_recharges.utr_number for fast duplicate-UTR lookups

Revision ID: 20260625_0093
Revises: 20260624_0092
Create Date: 2026-06-25

Duplicate-UTR rejection is enforced at the API layer (a non-rejected recharge
with the same UTR blocks a new one). This plain index just speeds up that
lookup. A unique constraint is intentionally NOT added here because legacy rows
may already contain duplicate UTRs, which would fail the migration.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260625_0093"
down_revision: Union[str, Sequence[str], None] = "20260624_0092"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_wallet_recharges_utr_number",
        "wallet_recharges",
        ["utr_number"],
    )


def downgrade() -> None:
    op.drop_index("ix_wallet_recharges_utr_number", table_name="wallet_recharges")
