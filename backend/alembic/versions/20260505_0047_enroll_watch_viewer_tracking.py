"""track enrollment viewer identity and unlock time

Revision ID: 20260505_0047
Revises: 20260428_0046
Create Date: 2026-05-05 19:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260505_0047"
down_revision = "20260428_0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("enroll_share_links", sa.Column("viewer_name", sa.String(length=120), nullable=True))
    op.add_column("enroll_share_links", sa.Column("viewer_phone", sa.String(length=32), nullable=True))
    op.add_column("enroll_share_links", sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("enroll_share_links", "unlocked_at")
    op.drop_column("enroll_share_links", "viewer_phone")
    op.drop_column("enroll_share_links", "viewer_name")
