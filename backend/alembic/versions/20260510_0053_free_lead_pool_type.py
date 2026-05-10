"""Add pool_type column to leads — separates paid pool from free lead pool.

Revision ID: 20260510_0053
Revises: 20260509_0052
Create Date: 2026-05-10
"""

from alembic import op
import sqlalchemy as sa

revision = "20260510_0053"
down_revision = "20260509_0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "pool_type",
            sa.String(20),
            nullable=False,
            server_default="paid",
        ),
    )


def downgrade() -> None:
    op.drop_column("leads", "pool_type")
