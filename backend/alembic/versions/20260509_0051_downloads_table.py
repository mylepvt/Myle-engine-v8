"""Add downloads table.

Revision ID: 0051_downloads
Revises: 0050
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0051_downloads"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "downloads",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False, server_default="0"),
        sa.Column("mime_type", sa.String(128), nullable=False, server_default="application/octet-stream"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("uploaded_by", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("downloads")
