"""Add push_subscriptions table for Web Push notifications

Revision ID: 20260417_0034
Revises: 20260417_0033
Create Date: 2026-04-17 03:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260417_0034"
down_revision = "20260417_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("keys_p256dh", sa.Text(), nullable=False),
        sa.Column("keys_auth", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_unique_constraint(
        "uq_push_sub_user_endpoint",
        "push_subscriptions",
        ["user_id", "endpoint"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_push_sub_user_endpoint", "push_subscriptions", type_="unique")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
