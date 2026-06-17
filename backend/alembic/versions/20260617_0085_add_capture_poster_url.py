"""Add poster_url to lead_capture_links (member-uploaded poster with QR)

Revision ID: 20260617_0085
Revises: 20260617_0084
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260617_0085"
down_revision: Union[str, Sequence[str], None] = "20260617_0084"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lead_capture_links",
        sa.Column("poster_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lead_capture_links", "poster_url")
