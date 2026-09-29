"""Add post-unlock skills training track (videos + per-member progress)

Revision ID: 20260929_0094
Revises: 20260625_0093
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_0094"
down_revision: Union[str, Sequence[str], None] = "20260625_0093"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skill_training_videos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("day_number", sa.Integer(), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("youtube_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "skill_training_progress",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_number", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "day_number", name="uq_skill_training_progress_user_day"),
    )
    op.create_index("ix_skill_training_progress_user_id", "skill_training_progress", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_skill_training_progress_user_id", table_name="skill_training_progress")
    op.drop_table("skill_training_progress")
    op.drop_table("skill_training_videos")
