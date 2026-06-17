"""create lead_sales (CC/sale billing engine — Phase 3)

Adds the ``lead_sales`` table: one row per (lead, billing_stage) capturing a
FOREVER Tax Invoice (case credits + rupee total + invoice metadata) for the
Day 3 and Day 6 billings. Mirrors the payment-proof lifecycle
(pending/approved/rejected) with an ``auto_verified`` flag for OCR-approved rows.

Revision ID: 20260531_0070
Revises: 20260531_0069
Create Date: 2026-05-31

"""
from alembic import op
import sqlalchemy as sa

revision = "20260531_0070"
down_revision = "20260531_0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_sales",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("billing_stage", sa.String(length=8), nullable=False),
        sa.Column("case_credits", sa.Numeric(7, 3), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=True),
        sa.Column("invoice_number", sa.String(length=64), nullable=True),
        sa.Column("fbo_id", sa.String(length=32), nullable=True),
        sa.Column("sponsor_id", sa.String(length=32), nullable=True),
        sa.Column("order_count", sa.Integer(), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("proof_url", sa.String(length=500), nullable=True),
        sa.Column("ocr_confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("ocr_raw_text", sa.Text(), nullable=True),
        sa.Column(
            "auto_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("verify_notes", sa.String(length=512), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "submitted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "approved_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(length=512), nullable=True),
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
        sa.UniqueConstraint("lead_id", "billing_stage", name="uq_lead_sale_stage"),
        sa.UniqueConstraint("invoice_number", name="uq_lead_sale_invoice_number"),
    )
    op.create_index("ix_lead_sales_lead_id", "lead_sales", ["lead_id"])
    op.create_index("ix_lead_sales_status", "lead_sales", ["status"])
    op.create_index("ix_lead_sales_owner_user_id", "lead_sales", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_lead_sales_owner_user_id", table_name="lead_sales")
    op.drop_index("ix_lead_sales_status", table_name="lead_sales")
    op.drop_index("ix_lead_sales_lead_id", table_name="lead_sales")
    op.drop_table("lead_sales")
