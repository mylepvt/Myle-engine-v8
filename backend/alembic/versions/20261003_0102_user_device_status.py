"""Per-member app setup: installed app vs browser, push permission

Revision ID: 20261003_0102
Revises: 20261003_0101
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261003_0102"
down_revision: Union[str, Sequence[str], None] = "20261003_0101"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_device_status",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("platform", sa.String(length=16), nullable=False, server_default="desktop"),
        sa.Column("standalone", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("push_permission", sa.String(length=16), nullable=False, server_default="default"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("user_device_status")
