"""Record each scheduled notification run (targeted vs reached)

Revision ID: 20261004_0100
Revises: 20261003_0103
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261004_0100"
down_revision: Union[str, Sequence[str], None] = "20261003_0103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_job_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job", sa.String(length=40), nullable=False),
        sa.Column("ran_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("targeted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_push_job_runs_job", "push_job_runs", ["job"])
    op.create_index("ix_push_job_runs_ran_at", "push_job_runs", ["ran_at"])


def downgrade() -> None:
    op.drop_index("ix_push_job_runs_ran_at", table_name="push_job_runs")
    op.drop_index("ix_push_job_runs_job", table_name="push_job_runs")
    op.drop_table("push_job_runs")
