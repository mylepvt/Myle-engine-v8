"""Enrollment link default window 960 -> 1080s (covers 16:56 video)

Revision ID: 20260606_0076
Revises: 20260606_0075
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_0076"
down_revision: Union[str, Sequence[str], None] = "20260606_0075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "enrollment_share_links",
        "window_seconds",
        server_default=sa.text("1080"),
        existing_type=sa.Integer(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "enrollment_share_links",
        "window_seconds",
        server_default=sa.text("960"),
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
