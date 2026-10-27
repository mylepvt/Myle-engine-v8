"""Skills Academy: six ordered categories of lessons (replaces the 7-day skills drip)

Lessons are seeded with the planned topics and no recording; admins add the
YouTube links, descriptions and practice tasks from the Training page. Lessons
already added to the old day-by-day track (``skill_training_videos``) are carried
over into the "Personal Development" category with their links and every
member's completions. The old tables are left in place, unused.

Revision ID: 20261027_0100
Revises: 20261022_0300
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261027_0100"
down_revision: Union[str, Sequence[str], None] = "20261022_0300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED: dict[str, list[str]] = {
    "process": [
        "The full flow from lead to closing",
        "What to do at each stage",
        "Deciding the prospect's next action",
        "CRM and follow-up discipline",
    ],
    "invitation": [
        "Who to invite",
        "How to create curiosity",
        "Invitation scripts and examples",
        "Handling common objections",
        "Confirming the meeting",
    ],
    "follow_up": [
        "Follow-up timing",
        "When there is no reply",
        "Interested vs confused prospects",
        "Understanding objections and doubts",
        "Deciding the next step",
    ],
    "bond_creation": [
        "Understanding the other person",
        "Asking useful questions",
        "Active listening",
        "Building trust",
        "Keeping the relationship without pressure",
    ],
    "mistakes": [
        "Incorrect messaging",
        "Overpromising and unnecessary pressure",
        "Repeated follow-up without understanding",
        "Incorrect product or income claims",
        "Professional conduct and good practices",
    ],
    "closing": [
        "Recognising readiness",
        "Asking the right questions",
        "Clarifying concerns",
        "Explaining next steps and onboarding",
        "Follow-through and decision tracking",
    ],
}


def upgrade() -> None:
    lessons = op.create_table(
        "skill_lessons",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("youtube_url", sa.String(length=500), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("practice_task", sa.Text(), nullable=True),
        sa.Column("practice_required", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_skill_lessons_category", "skill_lessons", ["category"])
    op.create_table(
        "skill_lesson_progress",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "lesson_id", sa.Integer(), sa.ForeignKey("skill_lessons.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("practice_response", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "lesson_id", name="uq_skill_lesson_progress_user_lesson"),
    )
    op.create_index("ix_skill_lesson_progress_user_id", "skill_lesson_progress", ["user_id"])

    # Carry the earlier day-by-day lessons (and who finished them) across.
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

    op.bulk_insert(
        lessons,
        [
            {"category": category, "position": position, "title": title, "practice_required": False}
            for category, titles in SEED.items()
            for position, title in enumerate(titles, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_skill_lesson_progress_user_id", table_name="skill_lesson_progress")
    op.drop_table("skill_lesson_progress")
    op.drop_index("ix_skill_lessons_category", table_name="skill_lessons")
    op.drop_table("skill_lessons")
