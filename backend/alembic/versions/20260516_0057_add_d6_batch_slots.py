"""add d6_6pm and d6_8pm batch slot columns to leads

Revision ID: 20260516_0057
Revises: 42aa0fb31119, a8e8a5cf0add
Create Date: 2026-05-16 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260516_0057"
down_revision: Union[str, Sequence[str], None] = ("42aa0fb31119", "a8e8a5cf0add")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("d6_6pm", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("leads", sa.Column("d6_8pm", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("leads", "d6_8pm")
    op.drop_column("leads", "d6_6pm")
