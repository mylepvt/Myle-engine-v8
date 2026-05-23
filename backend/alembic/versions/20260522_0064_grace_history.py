"""add grace_history table

Revision ID: 20260522_0064
Revises: 20260521_0063
Create Date: 2026-05-22
"""
import sqlalchemy as sa
from alembic import op

revision = "20260522_0064"
down_revision = "20260521_0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grace_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_end_date", sa.Date(), nullable=True),
        sa.Column("request_reason", sa.Text(), nullable=True),
        sa.Column("calls_streak_at_request", sa.Integer(), nullable=True),
        sa.Column("report_streak_at_request", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("outcome_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("final_end_date", sa.Date(), nullable=True),
        sa.Column("action_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_grace_history_user_id", "grace_history", ["user_id"])
    op.create_index("ix_grace_history_requested_at", "grace_history", ["requested_at"])
    op.create_index("ix_grace_history_outcome_at", "grace_history", ["outcome_at"])
    op.create_index("ix_grace_history_outcome", "grace_history", ["outcome"])


def downgrade() -> None:
    op.drop_index("ix_grace_history_outcome", table_name="grace_history")
    op.drop_index("ix_grace_history_outcome_at", table_name="grace_history")
    op.drop_index("ix_grace_history_requested_at", table_name="grace_history")
    op.drop_index("ix_grace_history_user_id", table_name="grace_history")
    op.drop_table("grace_history")
