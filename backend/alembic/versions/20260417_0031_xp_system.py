"""xp_system table and user xp columns

Revision ID: 20260417_0031
Revises: 20260417_0030
Create Date: 2026-04-17 00:31:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260417_0031"
down_revision = "20260417_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "xp_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("xp", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_xp_events_user_id", "xp_events", ["user_id"])

    op.add_column("users", sa.Column("xp_total", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("xp_level", sa.String(32), nullable=False, server_default="rookie"))
    op.add_column("users", sa.Column("login_streak", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("last_login_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_login_date")
    op.drop_column("users", "login_streak")
    op.drop_column("users", "xp_level")
    op.drop_column("users", "xp_total")
    op.drop_index("ix_xp_events_user_id", table_name="xp_events")
    op.drop_table("xp_events")
