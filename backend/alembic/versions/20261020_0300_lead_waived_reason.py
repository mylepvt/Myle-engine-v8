"""leads.waived_reason: leads given free to a member, and why

Revision ID: 20261020_0300
Revises: 20261020_0200
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261020_0300"
down_revision: Union[str, Sequence[str], None] = "20261020_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("waived_reason", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "waived_reason")
