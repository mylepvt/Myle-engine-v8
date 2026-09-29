"""Index activity_log(entity_type, entity_id, action) for pool-claim lookups

Calling Board "Today" tab and the pool claim gate look up claim events per lead.

Revision ID: 20260929_0095
Revises: 20260929_0094
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260929_0095"
down_revision: Union[str, Sequence[str], None] = "20260929_0094"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_activity_log_entity_action",
        "activity_log",
        ["entity_type", "entity_id", "action"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_activity_log_entity_action", table_name="activity_log")
