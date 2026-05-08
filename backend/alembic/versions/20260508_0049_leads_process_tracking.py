"""add process_tracking to leads

Revision ID: 20260508_0049
Revises: 20260507_0048
Create Date: 2026-05-08 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260508_0049"
down_revision = "20260507_0048"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table_name)}
    return column_name in cols


def upgrade() -> None:
    if _has_column("leads", "process_tracking"):
        return
    op.add_column("leads", sa.Column("process_tracking", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _has_column("leads", "process_tracking"):
        op.drop_column("leads", "process_tracking")
