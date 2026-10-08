"""Process rewards: MYLE Points ledger + daily jackpot draws

Revision ID: 20261006_0100
Revises: 20261004_0101
Create Date: 2026-10-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261006_0100"
down_revision: Union[str, Sequence[str], None] = "20261004_0101"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_points",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step", sa.String(48), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(32), nullable=True),
        sa.UniqueConstraint("lead_id", "step", name="uq_process_points_lead_step"),
    )
    op.create_index("ix_process_points_user_id", "process_points", ["user_id"])
    op.create_index("ix_process_points_lead_id", "process_points", ["lead_id"])
    op.create_index("ix_process_points_created_at", "process_points", ["created_at"])
    op.create_table(
        "jackpot_draws",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("draw_date", sa.Date(), nullable=False, unique=True),
        sa.Column("pot_cents", sa.Integer(), nullable=False),
        sa.Column("winner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tickets_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("players", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("jackpot_draws")
    op.drop_index("ix_process_points_created_at", table_name="process_points")
    op.drop_index("ix_process_points_lead_id", table_name="process_points")
    op.drop_index("ix_process_points_user_id", table_name="process_points")
    op.drop_table("process_points")
