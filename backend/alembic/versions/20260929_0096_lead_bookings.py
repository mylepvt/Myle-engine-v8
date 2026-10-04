"""Add lead_bookings (members reserve N pool leads for a day; auto-filled on pool load)

Revision ID: 20260929_0096
Revises: 20260929_0095
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_0096"
down_revision: Union[str, Sequence[str], None] = "20260929_0095"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_bookings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("fulfilled_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("last_skip_reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "booking_date", name="uq_lead_booking_user_day"),
    )
    op.create_index("ix_lead_bookings_user_id", "lead_bookings", ["user_id"])
    op.create_index("ix_lead_bookings_booking_date", "lead_bookings", ["booking_date"])


def downgrade() -> None:
    op.drop_index("ix_lead_bookings_booking_date", table_name="lead_bookings")
    op.drop_index("ix_lead_bookings_user_id", table_name="lead_bookings")
    op.drop_table("lead_bookings")
