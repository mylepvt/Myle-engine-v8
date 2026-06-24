"""Add private_feedback to daily_reports (admin-only complaint field)

Revision ID: 20260624_0091
Revises: 20260623_0090
Create Date: 2026-06-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260624_0091"
down_revision: Union[str, Sequence[str], None] = "20260623_0090"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "daily_reports",
        sa.Column("private_feedback", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_reports", "private_feedback")
