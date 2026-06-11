"""Add tutorial_pending column to users table

Revision ID: 20260611_0077
Revises: 20260606_0076
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260611_0077"
down_revision: Union[str, Sequence[str], None] = "20260606_0076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "tutorial_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "tutorial_pending")
