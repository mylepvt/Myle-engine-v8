"""Add batch share links for tokenized workboard WhatsApp.

Revision ID: 20260415_0028
Revises: 20260415_0027
Create Date: 2026-04-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260415_0028"
down_revision: Union[str, Sequence[str], None] = "20260415_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "batch_share_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("slot", sa.String(length=32), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_batch_share_links_token", "batch_share_links", ["token"], unique=True)
    op.create_index("ix_batch_share_links_lead_id", "batch_share_links", ["lead_id"], unique=False)
    op.create_index("ix_batch_share_links_slot", "batch_share_links", ["slot"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_batch_share_links_slot", table_name="batch_share_links")
    op.drop_index("ix_batch_share_links_lead_id", table_name="batch_share_links")
    op.drop_index("ix_batch_share_links_token", table_name="batch_share_links")
    op.drop_table("batch_share_links")
