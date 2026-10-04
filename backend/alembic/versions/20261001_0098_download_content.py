"""Store Downloads file bytes in Postgres (Render container disk is wiped on deploy)

Revision ID: 20261001_0098
Revises: 20260929_0097
Create Date: 2026-10-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261001_0098"
down_revision: Union[str, Sequence[str], None] = "20260929_0097"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("downloads", sa.Column("content", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("downloads", "content")
