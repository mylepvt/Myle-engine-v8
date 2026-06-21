"""Add lead post-close register/onboarding columns

Revision ID: 20260621_0089
Revises: 20260618_0088
Create Date: 2026-06-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260621_0089"
down_revision: Union[str, Sequence[str], None] = "20260618_0088"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("register_token", sa.String(64), nullable=True))
    op.add_column(
        "leads",
        sa.Column("register_link_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("leads", sa.Column("registered_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "leads",
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_leads_register_token", "leads", ["register_token"], unique=True
    )
    op.create_foreign_key(
        "fk_leads_registered_user_id_users",
        "leads",
        "users",
        ["registered_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_leads_registered_user_id_users", "leads", type_="foreignkey")
    op.drop_index("ix_leads_register_token", table_name="leads")
    op.drop_column("leads", "registered_at")
    op.drop_column("leads", "registered_user_id")
    op.drop_column("leads", "register_link_sent_at")
    op.drop_column("leads", "register_token")
