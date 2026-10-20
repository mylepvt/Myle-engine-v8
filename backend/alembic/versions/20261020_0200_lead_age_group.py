"""leads.age_group: the age range a form asked ("19 to 21")

Revision ID: 20261020_0200
Revises: 20261020_0100
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261020_0200"
down_revision: Union[str, Sequence[str], None] = "20261020_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("age_group", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "age_group")
