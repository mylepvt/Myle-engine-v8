"""Add user notification preference columns

Revision ID: 20260616_0083
Revises: 20260612_0082
Create Date: 2026-06-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260616_0083"
down_revision: Union[str, Sequence[str], None] = "20260612_0082"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "push_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "whatsapp_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "daily_report_reminders_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "lead_assignment_alerts_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "weekly_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "weekly_summary_enabled")
    op.drop_column("users", "lead_assignment_alerts_enabled")
    op.drop_column("users", "daily_report_reminders_enabled")
    op.drop_column("users", "whatsapp_notifications_enabled")
    op.drop_column("users", "push_notifications_enabled")
