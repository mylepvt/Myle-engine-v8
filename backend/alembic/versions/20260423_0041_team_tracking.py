"""team tracking presence + daily member stats

Revision ID: 20260423_0041
Revises: 20260422_0040
Create Date: 2026-04-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260423_0041"
down_revision = "20260422_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])

    op.add_column("follow_ups", sa.Column("completed_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_follow_ups_completed_by_user_id_users",
        "follow_ups",
        "users",
        ["completed_by_user_id"],
        ["id"],
    )
    op.create_index("ix_follow_ups_completed_by_user_id", "follow_ups", ["completed_by_user_id"])

    op.create_table(
        "user_presence_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'online'")),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_path", sa.String(length=255), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_key", name="uq_user_presence_sessions_session_key"),
    )
    op.create_index("ix_user_presence_sessions_user_id", "user_presence_sessions", ["user_id"])
    op.create_index("ix_user_presence_sessions_session_key", "user_presence_sessions", ["session_key"])
    op.create_index("ix_user_presence_sessions_status", "user_presence_sessions", ["status"])
    op.create_index(
        "ix_user_presence_sessions_last_heartbeat_at",
        "user_presence_sessions",
        ["last_heartbeat_at"],
    )
    op.create_index("ix_user_presence_sessions_last_seen_at", "user_presence_sessions", ["last_seen_at"])
    op.create_index(
        "ix_user_presence_sessions_disconnected_at",
        "user_presence_sessions",
        ["disconnected_at"],
    )

    op.create_table(
        "daily_member_stats",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("login_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("calls_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("leads_added_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("followups_done_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("consistency_score", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("consistency_band", sa.String(length=16), nullable=False, server_default=sa.text("'low'")),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "stat_date", name="uq_daily_member_stats_user_date"),
    )
    op.create_index("ix_daily_member_stats_user_id", "daily_member_stats", ["user_id"])
    op.create_index("ix_daily_member_stats_stat_date", "daily_member_stats", ["stat_date"])
    op.create_index(
        "ix_daily_member_stats_consistency_band",
        "daily_member_stats",
        ["consistency_band"],
    )


def downgrade() -> None:
    op.drop_index("ix_daily_member_stats_consistency_band", table_name="daily_member_stats")
    op.drop_index("ix_daily_member_stats_stat_date", table_name="daily_member_stats")
    op.drop_index("ix_daily_member_stats_user_id", table_name="daily_member_stats")
    op.drop_table("daily_member_stats")

    op.drop_index("ix_user_presence_sessions_disconnected_at", table_name="user_presence_sessions")
    op.drop_index("ix_user_presence_sessions_last_seen_at", table_name="user_presence_sessions")
    op.drop_index("ix_user_presence_sessions_last_heartbeat_at", table_name="user_presence_sessions")
    op.drop_index("ix_user_presence_sessions_status", table_name="user_presence_sessions")
    op.drop_index("ix_user_presence_sessions_session_key", table_name="user_presence_sessions")
    op.drop_index("ix_user_presence_sessions_user_id", table_name="user_presence_sessions")
    op.drop_table("user_presence_sessions")

    op.drop_index("ix_follow_ups_completed_by_user_id", table_name="follow_ups")
    op.drop_constraint("fk_follow_ups_completed_by_user_id_users", "follow_ups", type_="foreignkey")
    op.drop_column("follow_ups", "completed_by_user_id")

    op.drop_index("ix_users_last_seen_at", table_name="users")
    op.drop_column("users", "last_seen_at")
