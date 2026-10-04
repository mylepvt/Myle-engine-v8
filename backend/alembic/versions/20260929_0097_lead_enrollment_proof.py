"""Add enrollment proof columns to leads (₹149–200 screenshot gates the Day 1 handoff)

Revision ID: 20260929_0097
Revises: 20260929_0096
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_0097"
down_revision: Union[str, Sequence[str], None] = "20260929_0096"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("enrollment_amount_cents", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("enrollment_proof_url", sa.String(length=500), nullable=True))
    op.add_column("leads", sa.Column("enrollment_proof_uploaded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("enrollment_proof_by_user_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "enrollment_proof_by_user_id")
    op.drop_column("leads", "enrollment_proof_uploaded_at")
    op.drop_column("leads", "enrollment_proof_url")
    op.drop_column("leads", "enrollment_amount_cents")
