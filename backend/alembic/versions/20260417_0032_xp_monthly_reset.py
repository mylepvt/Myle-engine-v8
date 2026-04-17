"""xp monthly archive table + season columns on users

Revision ID: 20260417_0032
Revises: 20260417_0031
Create Date: 2026-04-17 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260417_0032"
down_revision = "20260417_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Archive table — one row per user per month
    op.create_table(
        "xp_monthly_archive",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("final_xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_level", sa.String(32), nullable=False, server_default="rookie"),
        sa.Column("archived_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "year", "month", name="uq_xp_archive_user_year_month"),
    )
    op.create_index("ix_xp_archive_user_id", "xp_monthly_archive", ["user_id"])

    # Season tracking on users — which month their current xp_total belongs to
    op.add_column("users", sa.Column("xp_season_year", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("xp_season_month", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "xp_season_month")
    op.drop_column("users", "xp_season_year")
    op.drop_index("ix_xp_archive_user_id", table_name="xp_monthly_archive")
    op.drop_table("xp_monthly_archive")
