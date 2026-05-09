"""add d3 batch slots to leads

Revision ID: 20260509_0050
Revises: 20260508_0049
Create Date: 2026-05-09 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260509_0050"
down_revision = "20260508_0049"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table_name)}
    return column_name in cols


def upgrade() -> None:
    for col in ("d3_morning", "d3_afternoon", "d3_evening"):
        if not _has_column("leads", col):
            op.add_column(
                "leads",
                sa.Column(col, sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )


def downgrade() -> None:
    for col in ("d3_morning", "d3_afternoon", "d3_evening"):
        if _has_column("leads", col):
            op.drop_column("leads", col)
