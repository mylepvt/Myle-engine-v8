"""leads: age, gender, ad_name for admin pool Excel import

Revision ID: 20260414_0022
Revises: 20260412_0021
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260414_0022"
down_revision: Union[str, Sequence[str], None] = "20260412_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("gender", sa.String(length=32), nullable=True))
    op.add_column("leads", sa.Column("ad_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "ad_name")
    op.drop_column("leads", "gender")
    op.drop_column("leads", "age")
