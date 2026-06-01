"""add cgst_cents + sgst_cents to lead_sales (personal commission / cheque)

The 25% personal-sale commission ("approx cheque") is computed off the bill's
net amount = invoice total − CGST − SGST. These two columns store the parsed
tax split (paise) so the dashboard can subtract them before applying the rate.

Revision ID: 20260601_0071
Revises: 20260531_0070
Create Date: 2026-06-01

"""
from alembic import op
import sqlalchemy as sa

revision = "20260601_0071"
down_revision = "20260531_0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lead_sales", sa.Column("cgst_cents", sa.Integer(), nullable=True))
    op.add_column("lead_sales", sa.Column("sgst_cents", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("lead_sales", "sgst_cents")
    op.drop_column("lead_sales", "cgst_cents")
