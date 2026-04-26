"""lead day3_entered_at for auto-inactive cron

Revision ID: 20260426_0045
Revises: 20260424_0044
Create Date: 2026-04-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260426_0045"
down_revision = "20260424_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("day3_entered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leads", "day3_entered_at")
