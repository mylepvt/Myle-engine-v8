"""announcement_reactions table — emoji reactions on notices

Revision ID: 20260617_0087
Revises: 20260617_0086
Create Date: 2026-06-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_0087"
down_revision: Union[str, Sequence[str], None] = "20260617_0086"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "announcement_reactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "announcement_id",
            sa.Integer(),
            sa.ForeignKey("announcements.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("emoji", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("announcement_id", "user_id", "emoji", name="uq_ann_reaction"),
    )


def downgrade() -> None:
    op.drop_table("announcement_reactions")
