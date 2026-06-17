"""Add Lead Outcome Engine columns (outcome, drop_reason, recycle_reason, etc.)

Revision ID: 20260612_0079
Revises: 20260612_0078
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260612_0079"
down_revision: Union[str, Sequence[str], None] = "20260612_0078"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("outcome", sa.String(16), nullable=True, index=True,
                  comment="active | converted | dead | recycle — collapsed business outcome"))
    op.add_column("leads", sa.Column("drop_reason", sa.String(32), nullable=True,
                  comment="Why lead was marked dead"))
    op.add_column("leads", sa.Column("drop_notes", sa.Text(), nullable=True))
    op.add_column("leads", sa.Column("drop_recorded_by_user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("leads", sa.Column("dropped_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("outcome_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("recycle_reason", sa.String(32), nullable=True,
                  comment="Why lead was moved to recycle"))

    # Backfill outcome for existing leads
    op.execute("""
        UPDATE leads SET outcome = (
            CASE
                WHEN status IN ('new_lead','contacted','invited','video_sent','video_watched','day1','day2','day3','training','new') THEN 'active'
                WHEN status = 'converted' THEN 'converted'
                WHEN status = 'lost' THEN 'dead'
                WHEN status IN ('retarget','inactive') THEN 'recycle'
                ELSE 'active'
            END
        )
    """)


def downgrade() -> None:
    op.drop_column("leads", "recycle_reason")
    op.drop_column("leads", "outcome_changed_at")
    op.drop_column("leads", "dropped_at")
    op.drop_column("leads", "drop_recorded_by_user_id")
    op.drop_column("leads", "drop_notes")
    op.drop_column("leads", "drop_reason")
    op.drop_column("leads", "outcome")
