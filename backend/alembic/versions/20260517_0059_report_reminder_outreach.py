"""report_reminder_outreach table

Revision ID: 20260517_0059
Revises: 20260516_0058
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa

revision = "20260517_0059"
down_revision = "20260516_0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_reminder_outreach",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("reminder_date", sa.Date(), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("member_name", sa.String(255), nullable=False),
        sa.Column("send_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_error", sa.Text(), nullable=True),
        sa.Column("wa_message_id", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_reminder_outreach_user_id", "report_reminder_outreach", ["user_id"])
    op.create_index("ix_report_reminder_outreach_date", "report_reminder_outreach", ["reminder_date"])


def downgrade() -> None:
    op.drop_index("ix_report_reminder_outreach_date", "report_reminder_outreach")
    op.drop_index("ix_report_reminder_outreach_user_id", "report_reminder_outreach")
    op.drop_table("report_reminder_outreach")
