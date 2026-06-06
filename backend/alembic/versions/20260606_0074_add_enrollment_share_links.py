"""Add enrollment_share_links (standalone secure enrollment video)

Revision ID: 20260606_0074
Revises: 006c3106eb31
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_0074"
down_revision: Union[str, Sequence[str], None] = "006c3106eb31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "enrollment_share_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("viewer_name", sa.String(length=120), nullable=True),
        sa.Column("viewer_phone", sa.String(length=32), nullable=True),
        sa.Column("video_source", sa.String(length=600), nullable=False),
        sa.Column(
            "title",
            sa.String(length=200),
            server_default=sa.text("'Enrollment video'"),
            nullable=True,
        ),
        sa.Column("device_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("device_locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_views", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("view_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("window_seconds", sa.Integer(), server_default=sa.text("960"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("creation_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_enrollment_share_links_token", "enrollment_share_links", ["token"], unique=True
    )
    op.create_index(
        "ix_enrollment_share_links_created_by_user_id",
        "enrollment_share_links",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_enrollment_share_links_device_fingerprint",
        "enrollment_share_links",
        ["device_fingerprint"],
    )


def downgrade() -> None:
    op.drop_index("ix_enrollment_share_links_device_fingerprint", table_name="enrollment_share_links")
    op.drop_index("ix_enrollment_share_links_created_by_user_id", table_name="enrollment_share_links")
    op.drop_index("ix_enrollment_share_links_token", table_name="enrollment_share_links")
    op.drop_table("enrollment_share_links")
