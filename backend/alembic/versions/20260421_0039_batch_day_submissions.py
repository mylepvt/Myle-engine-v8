"""batch day submissions

Revision ID: 20260421_0039
Revises: 20260420_0038
Create Date: 2026-04-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260421_0039"
down_revision = "20260420_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "batch_day_submissions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "lead_id",
            sa.Integer(),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "batch_share_link_id",
            sa.Integer(),
            sa.ForeignKey("batch_share_links.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("day_number", sa.Integer(), nullable=False),
        sa.Column("slot", sa.String(length=32), nullable=False),
        sa.Column("notes_url", sa.Text(), nullable=True),
        sa.Column("voice_note_url", sa.Text(), nullable=True),
        sa.Column("video_url", sa.Text(), nullable=True),
        sa.Column("notes_text", sa.Text(), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("lead_id", "slot", name="uq_batch_day_submissions_lead_slot"),
    )
    op.create_index("ix_batch_day_submissions_lead_id", "batch_day_submissions", ["lead_id"])
    op.create_index(
        "ix_batch_day_submissions_batch_share_link_id",
        "batch_day_submissions",
        ["batch_share_link_id"],
    )
    op.create_index("ix_batch_day_submissions_slot", "batch_day_submissions", ["slot"])


def downgrade() -> None:
    op.drop_index("ix_batch_day_submissions_slot", table_name="batch_day_submissions")
    op.drop_index("ix_batch_day_submissions_batch_share_link_id", table_name="batch_day_submissions")
    op.drop_index("ix_batch_day_submissions_lead_id", table_name="batch_day_submissions")
    op.drop_table("batch_day_submissions")
