"""Add member_feedback (standalone admin-only feedback from dashboard)

Revision ID: 20260624_0092
Revises: 20260624_0091
Create Date: 2026-06-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260624_0092"
down_revision: Union[str, Sequence[str], None] = "20260624_0091"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "member_feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_member_feedback_user_id", "member_feedback", ["user_id"])
    op.create_index("ix_member_feedback_created_at", "member_feedback", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_member_feedback_created_at", table_name="member_feedback")
    op.drop_index("ix_member_feedback_user_id", table_name="member_feedback")
    op.drop_table("member_feedback")
