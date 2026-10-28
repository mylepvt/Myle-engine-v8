"""Daily text: one admin-written message per day for the Home card

Revision ID: 20261029_0100
Revises: 20261027_0200
Create Date: 2026-10-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261029_0100"
down_revision: Union[str, Sequence[str], None] = "20261027_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "daily_texts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("text_date", sa.Date(), nullable=False),
        sa.Column("headline", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_daily_texts_text_date", "daily_texts", ["text_date"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_daily_texts_text_date", table_name="daily_texts")
    op.drop_table("daily_texts")
