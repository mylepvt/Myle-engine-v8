"""Change avatar_url from String(512) to Text for base64 data URLs

Revision ID: 20260417_0033
Revises: 20260417_0032
Create Date: 2026-04-17 02:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260417_0033"
down_revision = "20260417_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "avatar_url",
        type_=sa.Text(),
        existing_type=sa.String(512),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "avatar_url",
        type_=sa.String(512),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
