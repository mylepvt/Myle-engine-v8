"""announcements table — notice board (legacy parity)

Revision ID: 20260411_0015
Revises: 20260411_0014
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260411_0015"
down_revision: Union[str, Sequence[str], None] = "20260411_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("pin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("announcements")
