"""Add enrollment_link_access capability flag to users

Revision ID: 20260606_0075
Revises: 20260606_0074
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_0075"
down_revision: Union[str, Sequence[str], None] = "20260606_0074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "enrollment_link_access",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "enrollment_link_access")
