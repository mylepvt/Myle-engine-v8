"""Leads hot-path indexes

Every calling-board / workboard list filters ``leads`` by assignee + archived/deleted,
and the 30-min maintenance jobs scan by status + last_action_at — none of these were
indexed, so each query was a full table scan.

Revision ID: 20261003_0103
Revises: 20261003_0102
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20261003_0103"
down_revision: Union[str, Sequence[str], None] = "20261003_0102"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_leads_assignee_active",
        "leads",
        ["assigned_to_user_id", "archived_at", "deleted_at"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_leads_status_last_action", "leads", ["status", "last_action_at"], if_not_exists=True
    )
    op.create_index(
        "ix_leads_created_by_user_id", "leads", ["created_by_user_id"], if_not_exists=True
    )


def downgrade() -> None:
    op.drop_index("ix_leads_created_by_user_id", table_name="leads", if_exists=True)
    op.drop_index("ix_leads_status_last_action", table_name="leads", if_exists=True)
    op.drop_index("ix_leads_assignee_active", table_name="leads", if_exists=True)
