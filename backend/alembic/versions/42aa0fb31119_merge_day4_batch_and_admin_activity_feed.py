"""merge_day4_batch_and_admin_activity_feed

Revision ID: 42aa0fb31119
Revises: 19ef8465ace5, 20260514_0056
Create Date: 2026-05-14 23:49:54.419317

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '42aa0fb31119'
down_revision: Union[str, Sequence[str], None] = ('19ef8465ace5', '20260514_0056')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
