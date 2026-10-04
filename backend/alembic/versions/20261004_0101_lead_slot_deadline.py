"""Day 3 slot deadline on leads ("slot reserved till")

Revision ID: 20261004_0101
Revises: 20261004_0100
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261004_0101"
down_revision: Union[str, Sequence[str], None] = "20261004_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("slot_deadline_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "slot_deadline_at")
