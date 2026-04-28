"""FLP CC ledger, monthly rollup, and rank columns on users

Revision ID: 20260428_0045
Revises: 20260424_0044
Create Date: 2026-04-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260428_0045"
down_revision = "20260424_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # flp_cc_entries — append-only CC ledger
    op.create_table(
        "flp_cc_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),
        sa.Column("cc_amount", sa.Float(), nullable=False),
        sa.Column("entry_type", sa.String(16), server_default="personal", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("recorded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_flp_cc_entries_user_id", "flp_cc_entries", ["user_id"])
    op.create_index("ix_flp_cc_entries_year_month", "flp_cc_entries", ["year_month"])

    # flp_monthly_cc — pre-computed monthly rollup
    op.create_table(
        "flp_monthly_cc",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),
        sa.Column("personal_cc", sa.Float(), nullable=False, server_default="0"),
        sa.Column("group_cc", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_cc", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "year_month", name="uq_flp_monthly_cc_user_month"),
    )
    op.create_index("ix_flp_monthly_cc_user_id", "flp_monthly_cc", ["user_id"])
    op.create_index("ix_flp_monthly_cc_year_month", "flp_monthly_cc", ["year_month"])

    # FLP rank columns on users
    op.add_column("users", sa.Column("flp_rank", sa.String(32), server_default="none", nullable=False))
    op.add_column("users", sa.Column("flp_cumulative_cc", sa.Float(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("flp_active_month_1", sa.String(7), nullable=True))
    op.add_column("users", sa.Column("flp_active_month_2", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "flp_active_month_2")
    op.drop_column("users", "flp_active_month_1")
    op.drop_column("users", "flp_cumulative_cc")
    op.drop_column("users", "flp_rank")

    op.drop_index("ix_flp_monthly_cc_year_month", table_name="flp_monthly_cc")
    op.drop_index("ix_flp_monthly_cc_user_id", table_name="flp_monthly_cc")
    op.drop_table("flp_monthly_cc")

    op.drop_index("ix_flp_cc_entries_year_month", table_name="flp_cc_entries")
    op.drop_index("ix_flp_cc_entries_user_id", table_name="flp_cc_entries")
    op.drop_table("flp_cc_entries")
