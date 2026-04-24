"""user grace self-request fields

Revision ID: 20260424_0044
Revises: 20260424_0043
Create Date: 2026-04-24 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260424_0044"
down_revision = "20260424_0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("grace_request_end_date", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("grace_request_reason", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("grace_request_requested_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_users_grace_request_end_date", "users", ["grace_request_end_date"])
    op.create_index("ix_users_grace_request_requested_at", "users", ["grace_request_requested_at"])


def downgrade() -> None:
    op.drop_index("ix_users_grace_request_requested_at", table_name="users")
    op.drop_index("ix_users_grace_request_end_date", table_name="users")

    op.drop_column("users", "grace_request_requested_at")
    op.drop_column("users", "grace_request_reason")
    op.drop_column("users", "grace_request_end_date")
