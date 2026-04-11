"""legacy_row_snapshots — lossless JSON archive of every legacy SQLite row

Revision ID: 20260411_0014
Revises: 20250412_0013
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260411_0014"
# Merge heads: enroll_share_links (20250411_0013) and seed admin branch (20250412_0013).
down_revision: Union[str, Sequence[str], None] = ("20250411_0013", "20250412_0013")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "legacy_row_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("import_run_id", sa.String(length=36), nullable=False),
        sa.Column("sqlite_label", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("table_name", sa.String(length=128), nullable=False),
        sa.Column("row_key", sa.String(length=512), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "import_run_id",
            "table_name",
            "row_key",
            name="uq_legacy_row_snap_run_table_key",
        ),
    )
    op.create_index(
        "ix_legacy_row_snapshots_import_run_id",
        "legacy_row_snapshots",
        ["import_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_legacy_row_snapshots_table_name",
        "legacy_row_snapshots",
        ["table_name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_legacy_row_snapshots_table_name", table_name="legacy_row_snapshots")
    op.drop_index("ix_legacy_row_snapshots_import_run_id", table_name="legacy_row_snapshots")
    op.drop_table("legacy_row_snapshots")
