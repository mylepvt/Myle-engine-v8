"""start enrollment link expiry on first open

Revision ID: 20260428_0046
Revises: 20260427_0045
Create Date: 2026-04-28 00:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260428_0046"
down_revision = "20260427_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("enroll_share_links", "expires_at", existing_type=sa.DateTime(timezone=True), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE enroll_share_links SET expires_at = COALESCE(expires_at, created_at, now())")
    op.alter_column("enroll_share_links", "expires_at", existing_type=sa.DateTime(timezone=True), nullable=False)
