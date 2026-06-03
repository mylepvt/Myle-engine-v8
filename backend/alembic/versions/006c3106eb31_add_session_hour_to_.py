"""Add session_hour to FlpMinBillingShareLink

Revision ID: 006c3106eb31
Revises: 20260601_0073
Create Date: 2026-06-02 17:22:38.736057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '006c3106eb31'
down_revision: Union[str, Sequence[str], None] = '20260601_0073'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('flp_min_billing_share_links', sa.Column('session_hour', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('flp_min_billing_share_links', 'session_hour')
