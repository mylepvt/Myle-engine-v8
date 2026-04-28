"""dream_entries table — one dream per user

Revision ID: 20260428_0046
Revises: 20260428_0045
Create Date: 2026-04-28 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260428_0046"
down_revision = "20260428_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dream_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False, server_default="other"),
        sa.Column("dream_text", sa.Text(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_dream_entries_user"),
    )
    op.create_index("ix_dream_entries_user_id", "dream_entries", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_dream_entries_user_id", table_name="dream_entries")
    op.drop_table("dream_entries")
