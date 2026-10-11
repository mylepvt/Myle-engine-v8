"""Prospect links are locked to the phone(s) that opened them with the lead's number

Revision ID: 20261011_0100
Revises: 20261006_0200
Create Date: 2026-10-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261011_0100"
down_revision: Union[str, Sequence[str], None] = "20261006_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("batch_share_links", sa.Column("bound_devices", _JSON, nullable=True))
    op.add_column("day2_test_sessions", sa.Column("bound_devices", _JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("day2_test_sessions", "bound_devices")
    op.drop_column("batch_share_links", "bound_devices")
