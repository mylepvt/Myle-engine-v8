"""add Day 2 cheat-proof test: lead columns + day2_test_sessions table

Lead gains day2_test_status/score/attempts/completed_at so the admin Day 2 → Day 3
gate can require a passed test. day2_test_sessions holds one locked attempt per unique
link (random question subset + option shuffle + server timer + anti-cheat telemetry).

Revision ID: 20260601_0072
Revises: 20260601_0071
Create Date: 2026-06-01

"""
from alembic import op
import sqlalchemy as sa

revision = "20260601_0072"
down_revision = "20260601_0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "day2_test_status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column("leads", sa.Column("day2_test_score", sa.Integer(), nullable=True))
    op.add_column(
        "leads",
        sa.Column(
            "day2_test_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "leads",
        sa.Column("day2_test_completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "day2_test_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("question_ids", sa.JSON(), nullable=True),
        sa.Column("option_orders", sa.JSON(), nullable=True),
        sa.Column("answers", sa.JSON(), nullable=True),
        sa.Column("current_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="created"),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("prospect_name", sa.String(length=255), nullable=True),
        sa.Column("prospect_phone", sa.String(length=32), nullable=True),
        sa.Column("blur_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hidden_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("copy_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paste_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_day2_test_sessions_token", "day2_test_sessions", ["token"], unique=True)
    op.create_index("ix_day2_test_sessions_lead_id", "day2_test_sessions", ["lead_id"])
    op.create_index("ix_day2_test_sessions_expires_at", "day2_test_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_day2_test_sessions_expires_at", table_name="day2_test_sessions")
    op.drop_index("ix_day2_test_sessions_lead_id", table_name="day2_test_sessions")
    op.drop_index("ix_day2_test_sessions_token", table_name="day2_test_sessions")
    op.drop_table("day2_test_sessions")
    op.drop_column("leads", "day2_test_completed_at")
    op.drop_column("leads", "day2_test_attempts")
    op.drop_column("leads", "day2_test_score")
    op.drop_column("leads", "day2_test_status")
