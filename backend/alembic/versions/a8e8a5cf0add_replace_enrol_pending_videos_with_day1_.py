"""replace enrollments_done/pending_enroll/videos_sent_actual with day1/2/3_count

Revision ID: a8e8a5cf0add
Revises: 20260512_0055
Create Date: 2026-05-12 12:13:39.670927

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8e8a5cf0add'
down_revision: Union[str, Sequence[str], None] = '20260512_0055'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('daily_reports', sa.Column('day1_count', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('daily_reports', sa.Column('day2_count', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('daily_reports', sa.Column('day3_count', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.drop_column('daily_reports', 'pending_enroll')
    op.drop_column('daily_reports', 'videos_sent_actual')
    op.drop_column('daily_reports', 'enrollments_done')


def downgrade() -> None:
    op.add_column('daily_reports', sa.Column('enrollments_done', sa.INTEGER(), autoincrement=False, nullable=False, server_default=sa.text('0')))
    op.add_column('daily_reports', sa.Column('videos_sent_actual', sa.INTEGER(), autoincrement=False, nullable=False, server_default=sa.text('0')))
    op.add_column('daily_reports', sa.Column('pending_enroll', sa.INTEGER(), autoincrement=False, nullable=False, server_default=sa.text('0')))
    op.drop_column('daily_reports', 'day3_count')
    op.drop_column('daily_reports', 'day2_count')
    op.drop_column('daily_reports', 'day1_count')
