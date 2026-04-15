"""CTCS: last_action_at, next_followup_at, heat_score, heat_last_decayed_at."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260415_0026"
down_revision = "20260412_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("last_action_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "leads",
        sa.Column("next_followup_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "leads",
        sa.Column("heat_score", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "leads",
        sa.Column("heat_last_decayed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leads", "heat_last_decayed_at")
    op.drop_column("leads", "heat_score")
    op.drop_column("leads", "next_followup_at")
    op.drop_column("leads", "last_action_at")
