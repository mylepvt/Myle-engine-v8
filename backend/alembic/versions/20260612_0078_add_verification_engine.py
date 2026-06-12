"""Add verification engine tables (VerificationTask, TaskAssignment)

Revision ID: 20260612_0078
Revises: 20260611_0077
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "20260612_0078"
down_revision: Union[str, Sequence[str], None] = "20260611_0077"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "verification_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("task_type", sa.String(32), nullable=False, server_default=sa.text("'CUSTOM'")),
        sa.Column("evidence_instructions", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_verification_tasks_is_active"), "verification_tasks", ["is_active"])

    op.create_table(
        "task_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("verification_task_id", sa.Integer(), sa.ForeignKey("verification_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("leader_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
                  comment="Snapshot of the member's leader at assignment time"),
        sa.Column("leader_chain_snapshot", JSONB(), nullable=True,
                  comment="Hierarchy chain frozen at assignment"),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.Column("evidence_file_url", sa.String(500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("blocker_reason", sa.String(32), nullable=True,
                  comment="Why task was not completed"),
        sa.Column("blocker_notes", sa.Text(), nullable=True),
        sa.Column("result_produced", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("result_notes", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalation_level", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_task_assignments_assigned_to"), "task_assignments", ["assigned_to_user_id"])
    op.create_index(op.f("ix_task_assignments_verification_task"), "task_assignments", ["verification_task_id"])
    op.create_index(op.f("ix_task_assignments_status"), "task_assignments", ["status"])
    op.create_index(op.f("ix_task_assignments_leader"), "task_assignments", ["leader_user_id"])


def downgrade() -> None:
    op.drop_table("task_assignments")
    op.drop_table("verification_tasks")
