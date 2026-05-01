"""add premiere_viewers table

Revision ID: 20260501_0047
Revises: 20260428_0046
Create Date: 2026-05-01 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260501_0047"
down_revision = "20260428_0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "premiere_viewers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("viewer_id", sa.String(64), nullable=False),
        sa.Column("session_date", sa.String(10), nullable=False),
        sa.Column("name", sa.String(200), nullable=False, server_default=""),
        sa.Column("city", sa.String(200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(30), nullable=False, server_default=""),
        sa.Column("joined_waiting", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_time_sec", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("percentage_watched", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("watch_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("rejoined", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("lead_score", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_premiere_viewers_viewer_id", "premiere_viewers", ["viewer_id"], unique=True)
    op.create_index("ix_premiere_viewers_session_date", "premiere_viewers", ["session_date"])


def downgrade() -> None:
    op.drop_index("ix_premiere_viewers_session_date", table_name="premiere_viewers")
    op.drop_index("ix_premiere_viewers_viewer_id", table_name="premiere_viewers")
    op.drop_table("premiere_viewers")
