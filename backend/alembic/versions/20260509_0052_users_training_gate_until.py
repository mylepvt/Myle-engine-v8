"""Add training_gate_until to users — discipline exempt while in active training window.

Revision ID: 20260509_0052
Revises: 0051_downloads
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa

revision = "20260509_0052"
down_revision = "0051_downloads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("training_gate_until", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "training_gate_until")
