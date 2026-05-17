"""member_removal_outreach table

Revision ID: 20260516_0058
Revises: 20260516_0057
Create Date: 2026-05-16

"""
from alembic import op
import sqlalchemy as sa

revision = "20260516_0058"
down_revision = "20260516_0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "member_removal_outreach",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("member_name", sa.String(255), nullable=False),
        sa.Column("removal_reason", sa.Text(), nullable=True),
        sa.Column("send_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_error", sa.Text(), nullable=True),
        sa.Column("manual_share_url", sa.Text(), nullable=True),
        sa.Column("reply_text", sa.Text(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("wa_message_id", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_member_removal_outreach_user_id", "member_removal_outreach", ["user_id"])
    op.create_index("ix_member_removal_outreach_phone", "member_removal_outreach", ["phone"])


def downgrade() -> None:
    op.drop_index("ix_member_removal_outreach_phone", "member_removal_outreach")
    op.drop_index("ix_member_removal_outreach_user_id", "member_removal_outreach")
    op.drop_table("member_removal_outreach")
