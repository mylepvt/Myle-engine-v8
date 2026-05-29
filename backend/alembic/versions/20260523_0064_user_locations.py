"""user_locations table — one row per user, upserted on each location ping

Revision ID: 20260523_0064
Revises: 20260521_0063
Create Date: 2026-05-23

"""
import sqlalchemy as sa
from alembic import op

revision = "20260523_0064"
down_revision = "20260521_0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_locations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("accuracy_meters", sa.Float, nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_user_locations_user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_locations")
