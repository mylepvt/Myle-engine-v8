"""Rewards phase 2: Power Hour multiplier, Team League, Season, scratch cards

Revision ID: 20261006_0200
Revises: 20261006_0100
Create Date: 2026-10-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261006_0200"
down_revision: Union[str, Sequence[str], None] = "20261006_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("process_points", sa.Column("multiplier", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "league_weeks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("week_start", sa.Date(), nullable=False, unique=True),
        sa.Column("pot_cents", sa.Integer(), nullable=False),
        sa.Column("winner_leader_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("standings", _JSON, nullable=False),
        sa.Column("payouts", _JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "season_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("month", sa.Date(), nullable=False, unique=True),
        sa.Column("winners", _JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "scratch_cards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_step", sa.String(48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("scratched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bonus_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("void_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("lead_id", "source_step", name="uq_scratch_cards_lead_step"),
    )
    op.create_index("ix_scratch_cards_user_id", "scratch_cards", ["user_id"])
    op.create_index("ix_scratch_cards_scratched_at", "scratch_cards", ["scratched_at"])


def downgrade() -> None:
    op.drop_index("ix_scratch_cards_scratched_at", table_name="scratch_cards")
    op.drop_index("ix_scratch_cards_user_id", table_name="scratch_cards")
    op.drop_table("scratch_cards")
    op.drop_table("season_results")
    op.drop_table("league_weeks")
    op.drop_column("process_points", "multiplier")
