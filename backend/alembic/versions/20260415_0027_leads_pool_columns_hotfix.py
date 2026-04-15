"""Hotfix: ensure pool demographic columns exist on leads.

Revision ID: 20260415_0027
Revises: 20260415_0026
Create Date: 2026-04-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260415_0027"
down_revision: Union[str, Sequence[str], None] = "20260415_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table_name)}
    return column_name in cols


def upgrade() -> None:
    if not _has_column("leads", "age"):
        op.add_column("leads", sa.Column("age", sa.Integer(), nullable=True))
    if not _has_column("leads", "gender"):
        op.add_column("leads", sa.Column("gender", sa.String(length=32), nullable=True))
    if not _has_column("leads", "ad_name"):
        op.add_column("leads", sa.Column("ad_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    if _has_column("leads", "ad_name"):
        op.drop_column("leads", "ad_name")
    if _has_column("leads", "gender"):
        op.drop_column("leads", "gender")
    if _has_column("leads", "age"):
        op.drop_column("leads", "age")
