"""leads.is_reassigned flag and reassigned_at timestamp

Revision ID: 20260525_0065
Revises: 20260523_0064
Create Date: 2026-05-25

"""
import sqlalchemy as sa
from alembic import op

revision = "20260525_0065"
down_revision = "20260523_0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "is_reassigned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "leads",
        sa.Column("reassigned_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leads", "reassigned_at")
    op.drop_column("leads", "is_reassigned")
