"""Notice board: voice notices, play tracking and replies

Revision ID: 20261018_0100
Revises: 20261011_0100
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261018_0100"
down_revision: Union[str, Sequence[str], None] = "20261011_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("announcements", sa.Column("audio_name", sa.String(length=255), nullable=True))
    op.add_column("announcements", sa.Column("audio_duration_sec", sa.Integer(), nullable=True))

    op.create_table(
        "announcement_plays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "announcement_id",
            sa.Integer(),
            sa.ForeignKey("announcements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_played_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_played_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("play_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("announcement_id", "user_id", name="uq_ann_play_user"),
    )
    op.create_index("ix_announcement_plays_announcement_id", "announcement_plays", ["announcement_id"])
    op.create_index("ix_announcement_plays_user_id", "announcement_plays", ["user_id"])

    op.create_table(
        "announcement_replies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "announcement_id",
            sa.Integer(),
            sa.ForeignKey("announcements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_announcement_replies_announcement_id", "announcement_replies", ["announcement_id"])
    op.create_index("ix_announcement_replies_user_id", "announcement_replies", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_announcement_replies_user_id", table_name="announcement_replies")
    op.drop_index("ix_announcement_replies_announcement_id", table_name="announcement_replies")
    op.drop_table("announcement_replies")
    op.drop_index("ix_announcement_plays_user_id", table_name="announcement_plays")
    op.drop_index("ix_announcement_plays_announcement_id", table_name="announcement_plays")
    op.drop_table("announcement_plays")
    op.drop_column("announcements", "audio_duration_sec")
    op.drop_column("announcements", "audio_name")
