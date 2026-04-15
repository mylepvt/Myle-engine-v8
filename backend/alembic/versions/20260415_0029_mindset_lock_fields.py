"""Add mindset-lock tracking columns on leads.

Revision ID: 20260415_0029
Revises: 20260415_0028
Create Date: 2026-04-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260415_0029"
down_revision: Union[str, Sequence[str], None] = "20260415_0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table_name)}
    return column_name in cols


def upgrade() -> None:
    if not _has_column("leads", "mindset_started_at"):
        op.add_column("leads", sa.Column("mindset_started_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("leads", "mindset_completed_at"):
        op.add_column("leads", sa.Column("mindset_completed_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column("leads", "mindset_lock_state"):
        op.add_column("leads", sa.Column("mindset_lock_state", sa.String(length=32), nullable=True))
    if not _has_column("leads", "mindset_completed_by_user_id"):
        op.add_column(
            "leads",
            sa.Column("mindset_completed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        )
    if not _has_column("leads", "mindset_leader_user_id"):
        op.add_column(
            "leads",
            sa.Column("mindset_leader_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        )


def downgrade() -> None:
    if _has_column("leads", "mindset_leader_user_id"):
        op.drop_column("leads", "mindset_leader_user_id")
    if _has_column("leads", "mindset_completed_by_user_id"):
        op.drop_column("leads", "mindset_completed_by_user_id")
    if _has_column("leads", "mindset_lock_state"):
        op.drop_column("leads", "mindset_lock_state")
    if _has_column("leads", "mindset_completed_at"):
        op.drop_column("leads", "mindset_completed_at")
    if _has_column("leads", "mindset_started_at"):
        op.drop_column("leads", "mindset_started_at")
