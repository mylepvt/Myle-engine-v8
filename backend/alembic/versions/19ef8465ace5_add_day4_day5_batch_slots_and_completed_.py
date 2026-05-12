"""add day4_day5 batch slots and completed_at

Revision ID: 19ef8465ace5
Revises: a8e8a5cf0add
Create Date: 2026-05-12 15:29:01.665396

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '19ef8465ace5'
down_revision: Union[str, Sequence[str], None] = 'a8e8a5cf0add'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('day4_completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('leads', sa.Column('day5_completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('leads', sa.Column('d4_morning', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('leads', sa.Column('d4_afternoon', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('leads', sa.Column('d4_evening', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('leads', sa.Column('d5_morning', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('leads', sa.Column('d5_afternoon', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('leads', sa.Column('d5_evening', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('leads', 'd5_evening')
    op.drop_column('leads', 'd5_afternoon')
    op.drop_column('leads', 'd5_morning')
    op.drop_column('leads', 'd4_evening')
    op.drop_column('leads', 'd4_afternoon')
    op.drop_column('leads', 'd4_morning')
    op.drop_column('leads', 'day5_completed_at')
    op.drop_column('leads', 'day4_completed_at')
