"""add leads.retarget_at — timestamp for the 1-month re-highlight

Phase 2 of the pipeline alignment adds the retarget re-highlight behavior: when a
lead enters ``lost``/``retarget`` it is stamped with ``retarget_at`` so the owner's
board can re-surface it (with context) one month later. Nullable timestamp,
backfilled lazily by the status side-effects on the next lost/retarget move.

Revision ID: 20260531_0069
Revises: 20260531_0068
Create Date: 2026-05-31

"""
from alembic import op
import sqlalchemy as sa

revision = "20260531_0069"
down_revision = "20260531_0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("retarget_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leads", "retarget_at")
