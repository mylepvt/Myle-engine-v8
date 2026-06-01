"""add Day 3 stage selection + seat-hold columns to leads

stage_selected ('stage1'|'stage2'|'stage3') + stage_price_cents +
seat_hold_amount_cents + seat_hold_expiry. Drives the Day 3 closing sub-flow
(Stage picker → seat-hold reserve with a lapse timer).

Revision ID: 20260601_0073
Revises: 20260601_0072
Create Date: 2026-06-01

"""
from alembic import op
import sqlalchemy as sa

revision = "20260601_0073"
down_revision = "20260601_0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("stage_selected", sa.String(length=16), nullable=True))
    op.add_column("leads", sa.Column("stage_price_cents", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("seat_hold_amount_cents", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("seat_hold_expiry", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_leads_seat_hold_expiry", "leads", ["seat_hold_expiry"])


def downgrade() -> None:
    op.drop_index("ix_leads_seat_hold_expiry", table_name="leads")
    op.drop_column("leads", "seat_hold_expiry")
    op.drop_column("leads", "seat_hold_amount_cents")
    op.drop_column("leads", "stage_price_cents")
    op.drop_column("leads", "stage_selected")
