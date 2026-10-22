"""Free recharge requests: a leader asks admin for promo wallet credit for their team

Revision ID: 20261022_0100
Revises: 20261021_0200
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261022_0100"
down_revision: Union[str, Sequence[str], None] = "20261021_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "free_recharge_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("admin_note", sa.String(length=512), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_free_recharge_requests_user_id", "free_recharge_requests", ["user_id"])
    op.create_index("ix_free_recharge_requests_requested_by_user_id", "free_recharge_requests", ["requested_by_user_id"])
    op.create_index("ix_free_recharge_requests_status", "free_recharge_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_free_recharge_requests_status", table_name="free_recharge_requests")
    op.drop_index("ix_free_recharge_requests_requested_by_user_id", table_name="free_recharge_requests")
    op.drop_index("ix_free_recharge_requests_user_id", table_name="free_recharge_requests")
    op.drop_table("free_recharge_requests")
