"""lead pool_price column + lead default status fix

Revision ID: 20250411_0012
Revises: 20250411_0011
Create Date: 2026-04-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20250411_0012"
down_revision: Union[str, Sequence[str], None] = "20250411_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pool_price: cost in paise (INR) to claim this lead from the pool
    # NULL = free (default for backwards compat)
    op.add_column(
        "leads",
        sa.Column("pool_price_cents", sa.Integer(), nullable=True, comment="Cost in paise to claim; NULL = free"),
    )
    # Update default status from 'new' to 'new_lead' for new rows
    op.alter_column(
        "leads",
        "status",
        server_default=sa.text("'new_lead'"),
    )


def downgrade() -> None:
    op.drop_column("leads", "pool_price_cents")
    op.alter_column(
        "leads",
        "status",
        server_default=sa.text("'new'"),
    )
