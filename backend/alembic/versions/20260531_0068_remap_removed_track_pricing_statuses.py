"""remap removed track-pricing lead statuses to nearest active pipeline stage

Phase 1 of the pipeline alignment removes the track-pricing lead statuses
(``track_selected``, ``seat_hold``, ``level_up``, ``plan_2cc``) — the closing
model is now the 5k / 2cc FLP-billing flow, not Slow/Medium/Fast seat-hold
tracks. ``Lead.status`` is a free-form ``String(32)`` (no DB enum), so existing
rows on the removed slugs are remapped here to the nearest surviving stage so
API-level validation and funnel queries stay consistent.

Mapping:
  track_selected -> day3        (closing environment)
  seat_hold      -> day3        (closing environment)
  level_up       -> converted   (closed won / upsell terminal)
  plan_2cc       -> interview   (Day 6 / 2cc closing stage)

``plan_2cc`` as a *daily report counter column* is intentionally left intact —
only the ``Lead.status`` value is remapped here.

Revision ID: 20260531_0068
Revises: 20260531_0067
Create Date: 2026-05-31

"""
from alembic import op
import sqlalchemy as sa

revision = "20260531_0068"
down_revision = "20260531_0067"
branch_labels = None
depends_on = None


_STATUS_REMAP = {
    "track_selected": "day3",
    "seat_hold": "day3",
    "level_up": "converted",
    "plan_2cc": "interview",
}


def upgrade() -> None:
    bind = op.get_bind()
    stmt = sa.text("UPDATE leads SET status = :new WHERE status = :old")
    for old, new in _STATUS_REMAP.items():
        bind.execute(stmt, {"old": old, "new": new})


def downgrade() -> None:
    # Irreversible: original distinction between remapped slugs is not recoverable.
    # No-op so the migration chain can still be stepped back without error.
    pass
