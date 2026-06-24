"""Add current_cc_sheets (CURRENT CCs v/s TARGET CCs daily sheet)

Revision ID: 20260623_0090
Revises: 20260621_0089
Create Date: 2026-06-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "20260623_0090"
down_revision: Union[str, Sequence[str], None] = "20260621_0089"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json():
    return sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "current_cc_sheets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("subject_user_id", sa.Integer(), nullable=False),
        sa.Column("sheet_date", sa.Date(), nullable=False),
        sa.Column("filled_by_user_id", sa.Integer(), nullable=True),
        sa.Column("target_ccs", sa.Float(), nullable=True),
        sa.Column("direct_persons", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("direct_total_ccs", sa.Float(), nullable=True),
        sa.Column("real_active_persons", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("light_active_persons", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("closed_persons", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("pending_persons", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("enrollment_rows", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("lead_cycle_rows", _json(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("lead_covered", sa.Text(), nullable=True),
        sa.Column("process_check", sa.Text(), nullable=True),
        sa.Column(
            "enrollment_tracking_rows", _json(), server_default=sa.text("'[]'"), nullable=False
        ),
        sa.Column("drop_reason_remarks", sa.Text(), nullable=True),
        sa.Column("improvement_area", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["subject_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["filled_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "subject_user_id", "sheet_date", name="uq_current_cc_subject_date"
        ),
    )
    op.create_index(
        "ix_current_cc_sheets_subject_user_id", "current_cc_sheets", ["subject_user_id"]
    )
    op.create_index("ix_current_cc_sheets_sheet_date", "current_cc_sheets", ["sheet_date"])


def downgrade() -> None:
    op.drop_index("ix_current_cc_sheets_sheet_date", table_name="current_cc_sheets")
    op.drop_index("ix_current_cc_sheets_subject_user_id", table_name="current_cc_sheets")
    op.drop_table("current_cc_sheets")
