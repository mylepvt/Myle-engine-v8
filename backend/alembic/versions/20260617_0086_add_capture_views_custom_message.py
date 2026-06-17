"""Add views + custom_message to lead_capture_links

Revision ID: 20260617_0086
Revises: 20260617_0085
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260617_0086"
down_revision: Union[str, Sequence[str], None] = "20260617_0085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lead_capture_links",
        sa.Column("custom_message", sa.Text(), nullable=True),
    )
    op.add_column(
        "lead_capture_links",
        sa.Column("views", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("lead_capture_links", "views")
    op.drop_column("lead_capture_links", "custom_message")
