"""users.upline_user_id — leader downline tree for lead visibility

Revision ID: 20260411_0016
Revises: 20260411_0015
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260411_0016"
down_revision: Union[str, Sequence[str], None] = "20260411_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("upline_user_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_users_upline_user_id",
        "users",
        ["upline_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_users_upline_user_id_users",
        "users",
        "users",
        ["upline_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_upline_user_id_users", "users", type_="foreignkey")
    op.drop_index("ix_users_upline_user_id", table_name="users")
    op.drop_column("users", "upline_user_id")
