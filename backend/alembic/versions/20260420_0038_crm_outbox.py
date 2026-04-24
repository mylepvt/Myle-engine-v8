"""crm outbox + lead crm shadow version

Revision ID: 20260420_0038
Revises: 20260419_0037
Create Date: 2026-04-20
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260420_0038"
down_revision: Union[str, Sequence[str], None] = "20260419_0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.add_column(
        "leads",
        sa.Column("crm_shadow_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )

    op.create_table(
        "crm_outbox",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("retries", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=96), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_crm_outbox_lead_id", "crm_outbox", ["lead_id"], unique=False)
    op.create_index("ix_crm_outbox_next_attempt_at", "crm_outbox", ["next_attempt_at"], unique=False)
    op.create_index(
        "idx_outbox_status_created",
        "crm_outbox",
        ["status", "next_attempt_at", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_outbox_status_created", table_name="crm_outbox")
    op.drop_index("ix_crm_outbox_next_attempt_at", table_name="crm_outbox")
    op.drop_index("ix_crm_outbox_lead_id", table_name="crm_outbox")
    op.drop_table("crm_outbox")
    op.drop_column("leads", "crm_shadow_version")
