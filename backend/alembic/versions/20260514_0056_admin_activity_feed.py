"""admin_activity_feed table

Revision ID: 20260514_0056
Revises: 20260512_0055
Create Date: 2026-05-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260514_0056"
down_revision = "20260512_0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_activity_feed",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=True),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_activity_feed_event_type", "admin_activity_feed", ["event_type"])
    op.create_index("ix_admin_activity_feed_lead_id", "admin_activity_feed", ["lead_id"])
    op.create_index("ix_admin_activity_feed_actor_id", "admin_activity_feed", ["actor_id"])
    op.create_index("ix_admin_activity_feed_created_at", "admin_activity_feed", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_activity_feed_created_at", table_name="admin_activity_feed")
    op.drop_index("ix_admin_activity_feed_actor_id", table_name="admin_activity_feed")
    op.drop_index("ix_admin_activity_feed_lead_id", table_name="admin_activity_feed")
    op.drop_index("ix_admin_activity_feed_event_type", table_name="admin_activity_feed")
    op.drop_table("admin_activity_feed")
