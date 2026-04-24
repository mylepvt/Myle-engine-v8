"""user compliance controls + grace lifecycle

Revision ID: 20260424_0042
Revises: 20260423_0041
Create Date: 2026-04-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260424_0042"
down_revision = "20260423_0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("grace_end_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("grace_reason", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("grace_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("grace_set_by_user_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("discipline_reset_on", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("removed_by_user_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("removal_reason", sa.Text(), nullable=True))

    op.create_foreign_key(
        "fk_users_grace_set_by_user_id_users",
        "users",
        "users",
        ["grace_set_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_users_removed_by_user_id_users",
        "users",
        "users",
        ["removed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_users_grace_end_date", "users", ["grace_end_date"])
    op.create_index("ix_users_grace_set_by_user_id", "users", ["grace_set_by_user_id"])
    op.create_index("ix_users_discipline_reset_on", "users", ["discipline_reset_on"])
    op.create_index("ix_users_removed_at", "users", ["removed_at"])
    op.create_index("ix_users_removed_by_user_id", "users", ["removed_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_users_removed_by_user_id", table_name="users")
    op.drop_index("ix_users_removed_at", table_name="users")
    op.drop_index("ix_users_discipline_reset_on", table_name="users")
    op.drop_index("ix_users_grace_set_by_user_id", table_name="users")
    op.drop_index("ix_users_grace_end_date", table_name="users")

    op.drop_constraint("fk_users_removed_by_user_id_users", "users", type_="foreignkey")
    op.drop_constraint("fk_users_grace_set_by_user_id_users", "users", type_="foreignkey")

    op.drop_column("users", "removal_reason")
    op.drop_column("users", "removed_by_user_id")
    op.drop_column("users", "removed_at")
    op.drop_column("users", "discipline_reset_on")
    op.drop_column("users", "grace_set_by_user_id")
    op.drop_column("users", "grace_updated_at")
    op.drop_column("users", "grace_reason")
    op.drop_column("users", "grace_end_date")
