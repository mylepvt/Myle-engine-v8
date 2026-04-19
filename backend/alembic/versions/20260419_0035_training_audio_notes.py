"""Add audio_url to training_videos and create training_day_notes table

Revision ID: 20260419_0035
Revises: 20260417_0034
Create Date: 2026-04-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260419_0035"
down_revision = "20260417_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("training_videos", sa.Column("audio_url", sa.Text(), nullable=True))

    op.create_table(
        "training_day_notes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_number", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_training_day_notes_user_id", "training_day_notes", ["user_id"])
    op.create_unique_constraint(
        "uq_training_day_notes_user_day",
        "training_day_notes",
        ["user_id", "day_number"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_training_day_notes_user_day", "training_day_notes", type_="unique")
    op.drop_index("ix_training_day_notes_user_id", table_name="training_day_notes")
    op.drop_table("training_day_notes")
    op.drop_column("training_videos", "audio_url")
