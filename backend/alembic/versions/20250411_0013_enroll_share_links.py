"""enroll_share_links table

Revision ID: 20250411_0013
Revises: 20250411_0012
Create Date: 2026-04-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20250411_0013"
down_revision: Union[str, Sequence[str], None] = "20250411_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "enroll_share_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("youtube_url", sa.String(500), nullable=True),
        sa.Column(
            "title",
            sa.String(200),
            nullable=True,
            server_default=sa.text("'Watch this important video'"),
        ),
        sa.Column(
            "view_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("first_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status_synced",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
    )
    op.create_index("ix_enroll_share_links_lead_id", "enroll_share_links", ["lead_id"])
    op.create_index("ix_enroll_share_links_token", "enroll_share_links", ["token"])


def downgrade() -> None:
    op.drop_index("ix_enroll_share_links_token", table_name="enroll_share_links")
    op.drop_index("ix_enroll_share_links_lead_id", table_name="enroll_share_links")
    op.drop_table("enroll_share_links")
