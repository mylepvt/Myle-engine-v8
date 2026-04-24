"""enrollment share link expiry

Revision ID: 20260424_0043
Revises: 20260424_0042
Create Date: 2026-04-24 00:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260424_0043"
down_revision = "20260424_0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("enroll_share_links", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE enroll_share_links SET expires_at = COALESCE(created_at, now()) + interval '30 minutes'")
    op.alter_column("enroll_share_links", "expires_at", nullable=False)
    op.create_index("ix_enroll_share_links_expires_at", "enroll_share_links", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_enroll_share_links_expires_at", table_name="enroll_share_links")
    op.drop_column("enroll_share_links", "expires_at")
