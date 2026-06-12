"""Training Campaign Engine (training_campaigns, campaign_missions, campaign_enrollments, campaign_member_progress)

Revision ID: 20260612_0081
Revises: 20260612_0080
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260612_0081"
down_revision: Union[str, Sequence[str], None] = "20260612_0080"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_campaigns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("webinar_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "campaign_missions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("training_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_key", sa.String(64), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("verification_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("evidence_instructions", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_campaign_missions_campaign"), "campaign_missions", ["campaign_id"])

    op.create_table(
        "campaign_enrollments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("training_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'enrolled'")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "user_id", name="uq_campaign_enrollment"),
    )
    op.create_index(op.f("ix_campaign_enrollments_campaign"), "campaign_enrollments", ["campaign_id"])
    op.create_index(op.f("ix_campaign_enrollments_user"), "campaign_enrollments", ["user_id"])

    op.create_table(
        "campaign_member_progress",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("campaign_enrollments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_mission_id", sa.Integer(), sa.ForeignKey("campaign_missions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("achieved", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("verified_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("enrollment_id", "campaign_mission_id", name="uq_campaign_progress_mission"),
    )
    op.create_index(op.f("ix_campaign_member_progress_enrollment"), "campaign_member_progress", ["enrollment_id"])


def downgrade() -> None:
    op.drop_table("campaign_member_progress")
    op.drop_table("campaign_enrollments")
    op.drop_table("campaign_missions")
    op.drop_table("training_campaigns")
