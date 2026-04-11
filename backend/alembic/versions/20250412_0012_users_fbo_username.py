"""users: fbo_id (unique login) + username (optional, non-unique)

Revision ID: 20250412_0012
Revises: 20250411_0011
Create Date: 2026-04-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "20250412_0012"
down_revision: Union[str, Sequence[str], None] = "20250411_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("fbo_id", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("username", sa.String(length=128), nullable=True))

    op.execute(
        text(
            "UPDATE users SET fbo_id = CASE email "
            "WHEN 'dev-admin@myle.local' THEN 'fbo-admin-001' "
            "WHEN 'dev-leader@myle.local' THEN 'fbo-leader-001' "
            "WHEN 'dev-team@myle.local' THEN 'fbo-team-001' "
            "ELSE lower(replace(email, '@', '-at-')) END"
        )
    )

    op.alter_column("users", "fbo_id", existing_type=sa.String(length=64), nullable=False)
    op.create_index(op.f("ix_users_fbo_id"), "users", ["fbo_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_fbo_id"), table_name="users")
    op.drop_column("users", "username")
    op.drop_column("users", "fbo_id")
