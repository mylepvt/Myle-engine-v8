"""Work streak: consecutive days the member hit the daily call target

Revision ID: 20261003_0100
Revises: 20261003_0099
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261003_0100"
down_revision: Union[str, Sequence[str], None] = "20261003_0099"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("work_streak", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("work_streak_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("work_streak_best", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "work_streak_best")
    op.drop_column("users", "work_streak_date")
    op.drop_column("users", "work_streak")
