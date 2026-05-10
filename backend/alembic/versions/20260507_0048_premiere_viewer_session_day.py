"""add session_day to premiere_viewers

Revision ID: 20260507_0048
Revises: 20260505_0047
Create Date: 2026-05-07 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260507_0048"
down_revision = ("20260501_0047", "20260505_0047")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "premiere_viewers",
        sa.Column("session_day", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_premiere_viewers_session_day", "premiere_viewers", ["session_day"])


def downgrade() -> None:
    op.drop_index("ix_premiere_viewers_session_day", table_name="premiere_viewers")
    op.drop_column("premiere_viewers", "session_day")
