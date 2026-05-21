"""add city and state columns to daily_check_ins

Revision ID: 20260521_0063
Revises: 20260521_0062
Create Date: 2026-05-21

"""
import sqlalchemy as sa
from alembic import op

revision = "20260521_0063"
down_revision = "20260521_0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("daily_check_ins", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("daily_check_ins", sa.Column("state", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("daily_check_ins", "state")
    op.drop_column("daily_check_ins", "city")
