"""Enrollment link after payment: member's payment details, prospect registration, cross-check

Revision ID: 20261021_0200
Revises: 20261021_0100
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261021_0200"
down_revision: Union[str, Sequence[str], None] = "20261021_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("payment_mode", sa.String(length=24)),
    ("payment_ref", sa.String(length=64)),
    ("paid_at", sa.DateTime(timezone=True)),
    ("member_proof_url", sa.String(length=500)),
    ("member_proof_sha256", sa.String(length=64)),
    ("member_proof_dhash", sa.String(length=64)),
    ("reg_name", sa.String(length=200)),
    ("reg_phone", sa.String(length=20)),
    ("reg_submitted_at", sa.DateTime(timezone=True)),
    ("prospect_proof_url", sa.String(length=500)),
    ("match_status", sa.String(length=16)),
    ("match_detail", sa.String(length=300)),
    ("approved_by_user_id", sa.Integer()),
    ("completed_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("deposit_consents", sa.Column(name, type_, nullable=True))
    op.add_column(
        "deposit_consents",
        sa.Column("reg_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("deposit_consents", "reg_attempts")
    for name, _ in reversed(_COLUMNS):
        op.drop_column("deposit_consents", name)
