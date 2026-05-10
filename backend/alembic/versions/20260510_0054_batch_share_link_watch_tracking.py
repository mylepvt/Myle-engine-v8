"""batch_share_link watch tracking columns

Revision ID: 20260510_0054
Revises: 20260510_0053_free_lead_pool_type
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "20260510_0054"
down_revision = "20260510_0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("batch_share_links", sa.Column("first_accessed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("batch_share_links", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_batch_share_links_last_seen_at", "batch_share_links", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_batch_share_links_last_seen_at", "batch_share_links")
    op.drop_column("batch_share_links", "last_seen_at")
    op.drop_column("batch_share_links", "first_accessed_at")
