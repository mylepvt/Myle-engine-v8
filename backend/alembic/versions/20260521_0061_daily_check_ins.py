"""daily_check_ins table for attendance and work-session tracking

Revision ID: 20260521_0061
Revises: 20260520_0060
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa

revision = "20260521_0061"
down_revision = "20260520_0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_check_ins",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("date", sa.Date, nullable=False, index=True),
        # Check-in
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("accuracy_meters", sa.Float, nullable=True),
        # Check-out
        sa.Column("check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checkout_latitude", sa.Float, nullable=True),
        sa.Column("checkout_longitude", sa.Float, nullable=True),
        sa.Column("checkout_accuracy_meters", sa.Float, nullable=True),
        # Activity
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("work_duration_minutes", sa.Integer, nullable=True),
        sa.Column("is_suspicious", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_check_in_user_date"),
    )


def downgrade() -> None:
    op.drop_table("daily_check_ins")
