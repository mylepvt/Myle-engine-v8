"""Deposit consent: the lead's email and the welcome email sent to it

Revision ID: 20261021_0100
Revises: 20261020_0400
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261021_0100"
down_revision: Union[str, Sequence[str], None] = "20261020_0400"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("deposit_consents", sa.Column("email", sa.String(length=320), nullable=True))
    op.add_column("deposit_consents", sa.Column("welcome_email_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "deposit_consents",
        sa.Column("welcome_email_sends", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("deposit_consents", "welcome_email_sends")
    op.drop_column("deposit_consents", "welcome_email_sent_at")
    op.drop_column("deposit_consents", "email")
