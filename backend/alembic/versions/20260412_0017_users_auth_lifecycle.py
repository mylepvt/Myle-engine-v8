"""users auth lifecycle + password_reset_tokens

Revision ID: 20260412_0017
Revises: 20260411_0016
Create Date: 2026-04-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "20260412_0017"
down_revision: Union[str, Sequence[str], None] = "20260411_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "status",
            sa.String(length=32),
            server_default=sa.text("'approved'"),
            nullable=False,
        ),
    )
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "training_required",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "training_status",
            sa.String(length=32),
            server_default=sa.text("'not_required'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "access_blocked",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "discipline_status",
            sa.String(length=32),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
    )
    op.add_column("users", sa.Column("name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("joining_date", sa.Date(), nullable=True))

    op.create_index("ix_users_phone", "users", ["phone"], unique=True)

    op.execute(
        text(
            "CREATE UNIQUE INDEX ix_users_username_lower_uniq ON users "
            "(lower(trim(username))) "
            "WHERE username IS NOT NULL AND trim(username) <> ''"
        )
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "used",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_password_reset_tokens_token"),
    )
    op.create_index(
        "ix_password_reset_tokens_user_id",
        "password_reset_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.execute(text("DROP INDEX IF EXISTS ix_users_username_lower_uniq"))
    op.drop_index("ix_users_phone", table_name="users")
    op.drop_column("users", "joining_date")
    op.drop_column("users", "name")
    op.drop_column("users", "discipline_status")
    op.drop_column("users", "access_blocked")
    op.drop_column("users", "training_status")
    op.drop_column("users", "training_required")
    op.drop_column("users", "phone")
    op.drop_column("users", "status")
