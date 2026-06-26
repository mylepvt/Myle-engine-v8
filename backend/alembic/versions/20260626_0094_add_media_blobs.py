"""Durable media blob storage (fallback when R2 is not configured)

Revision ID: 20260626_0094
Revises: 20260625_0093
Create Date: 2026-06-26

Payment proofs, sale invoices and capture posters were served from the local
upload dir, which is ephemeral on Render — files vanish on redeploy / spin-down,
so "View proof" / "View invoice" links 404. When R2 is not configured we now
persist the image bytes in this table instead so the served URLs survive
restarts.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260626_0094"
down_revision: Union[str, Sequence[str], None] = "20260625_0093"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_blobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_media_blobs_storage_key",
        "media_blobs",
        ["storage_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_media_blobs_storage_key", table_name="media_blobs")
    op.drop_table("media_blobs")
