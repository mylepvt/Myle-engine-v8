"""Add certificate_url to users; change training completion gate to certificate upload.

Revision ID: 20260419_0036
Revises: 20260419_0035
Create Date: 2026-04-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260419_0036"
down_revision: Union[str, Sequence[str], None] = "20260419_0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("certificate_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "certificate_url")
