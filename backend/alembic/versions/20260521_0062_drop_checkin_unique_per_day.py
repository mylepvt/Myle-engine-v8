"""drop unique-per-day constraint on daily_check_ins — allow multiple sessions

Revision ID: 20260521_0062
Revises: 20260521_0061
Create Date: 2026-05-21

"""
from alembic import op

revision = "20260521_0062"
down_revision = "20260521_0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_daily_check_in_user_date", "daily_check_ins", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_daily_check_in_user_date", "daily_check_ins", ["user_id", "date"]
    )
