"""Skills Academy: bring back the Personal Development lessons from the old day-by-day track

Lessons added to ``skill_training_videos`` before the switch to categories were
no longer shown. Copy them into the "Personal Development" category with their
YouTube links, plus every member's completions from ``skill_training_progress``.
Skipped when that category already has lessons, so nothing is duplicated.

Revision ID: 20261027_0200
Revises: 20261027_0100
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261027_0200"
down_revision: Union[str, Sequence[str], None] = "20261027_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT COUNT(*) FROM skill_lessons WHERE category = 'personal_development'")
    ).scalar()
    if existing:
        return
    op.execute(
        """
        INSERT INTO skill_lessons (category, position, title, youtube_url, practice_required)
        SELECT 'personal_development', day_number, title, youtube_url, false
        FROM skill_training_videos
        ORDER BY day_number
        """
    )
    op.execute(
        """
        INSERT INTO skill_lesson_progress (user_id, lesson_id, completed_at)
        SELECT p.user_id, l.id, p.completed_at
        FROM skill_training_progress p
        JOIN skill_lessons l
          ON l.category = 'personal_development' AND l.position = p.day_number
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM skill_lesson_progress
        WHERE lesson_id IN (SELECT id FROM skill_lessons WHERE category = 'personal_development')
        """
    )
    op.execute("DELETE FROM skill_lessons WHERE category = 'personal_development'")
