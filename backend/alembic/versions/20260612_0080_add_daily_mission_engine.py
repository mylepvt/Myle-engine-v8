"""Add Daily Mission Engine tables (mission_templates, daily_missions, mission_blockers)

Revision ID: 20260612_0080
Revises: 20260612_0079
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "20260612_0080"
down_revision: Union[str, Sequence[str], None] = "20260612_0079"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mission_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default=sa.text("'team'")),
        sa.Column("items", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "daily_missions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_date", sa.Date(), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("mission_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("items", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("completion_pct", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "mission_date", name="uq_daily_missions_user_date"),
    )
    op.create_index(op.f("ix_daily_missions_user_id"), "daily_missions", ["user_id", "mission_date"])

    op.create_table(
        "mission_blockers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("daily_mission_id", sa.Integer(), sa.ForeignKey("daily_missions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mission_blockers_mission"), "mission_blockers", ["daily_mission_id"])


def downgrade() -> None:
    op.drop_table("mission_blockers")
    op.drop_table("daily_missions")
    op.drop_table("mission_templates")
