"""Team wins feed + cheers

Revision ID: 20261003_0101
Revises: 20261003_0100
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261003_0101"
down_revision: Union[str, Sequence[str], None] = "20261003_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wins",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("detail", sa.String(length=60), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_wins_user_id", "wins", ["user_id"])
    op.create_index("ix_wins_created_at", "wins", ["created_at"])
    op.create_table(
        "win_cheers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("win_id", sa.Integer(), sa.ForeignKey("wins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("win_id", "user_id", name="uq_win_cheers_win_user"),
    )
    op.create_index("ix_win_cheers_win_id", "win_cheers", ["win_id"])


def downgrade() -> None:
    op.drop_index("ix_win_cheers_win_id", table_name="win_cheers")
    op.drop_table("win_cheers")
    op.drop_index("ix_wins_created_at", table_name="wins")
    op.drop_index("ix_wins_user_id", table_name="wins")
    op.drop_table("wins")
