"""Add lead_capture_links table (member personal capture links)

Revision ID: 20260617_0084
Revises: 20260616_0083
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260617_0084"
down_revision: Union[str, Sequence[str], None] = "20260616_0083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_capture_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("leads_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lead_capture_links_token",
        "lead_capture_links",
        ["token"],
        unique=True,
    )
    op.create_index(
        "ix_lead_capture_links_owner_user_id",
        "lead_capture_links",
        ["owner_user_id"],
    )

    # Mark leads that came from a capture link → "Generated" pill on the Calling Board.
    op.add_column(
        "leads",
        sa.Column("capture_link_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_leads_capture_link_id",
        "leads",
        "lead_capture_links",
        ["capture_link_id"],
        ["id"],
    )
    op.create_index(
        "ix_leads_capture_link_id",
        "leads",
        ["capture_link_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_leads_capture_link_id", table_name="leads")
    op.drop_constraint("fk_leads_capture_link_id", "leads", type_="foreignkey")
    op.drop_column("leads", "capture_link_id")
    op.drop_index("ix_lead_capture_links_owner_user_id", table_name="lead_capture_links")
    op.drop_index("ix_lead_capture_links_token", table_name="lead_capture_links")
    op.drop_table("lead_capture_links")
