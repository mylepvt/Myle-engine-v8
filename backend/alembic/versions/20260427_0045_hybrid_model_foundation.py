"""hybrid model foundation fields

Revision ID: 20260427_0045
Revises: 20260424_0044
Create Date: 2026-04-27 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260427_0045"
down_revision = "20260424_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("hybrid_model_path", sa.String(length=32), nullable=False, server_default="consumer_first"))
    op.add_column("users", sa.Column("flp_identity_stage", sa.String(length=32), nullable=False, server_default="prospect"))
    op.add_column("users", sa.Column("flp_rank", sa.String(length=32), nullable=False, server_default="none"))
    op.add_column("users", sa.Column("primary_training_track", sa.String(length=32), nullable=False, server_default="prospect"))
    op.add_column("users", sa.Column("kyc_status", sa.String(length=32), nullable=False, server_default="not_started"))
    op.add_column("users", sa.Column("pan_status", sa.String(length=32), nullable=False, server_default="not_started"))
    op.add_column("users", sa.Column("aadhaar_status", sa.String(length=32), nullable=False, server_default="not_started"))
    op.add_column("users", sa.Column("product_ritual_status", sa.String(length=32), nullable=False, server_default="not_started"))
    op.add_column("users", sa.Column("dream_category", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("dream_statement", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("why_statement", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("story_spine", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("product_experience_notes", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mentor_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_users_mentor_user_id_users", "users", "users", ["mentor_user_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_users_mentor_user_id", "users", ["mentor_user_id"])

    op.add_column("leads", sa.Column("prospect_intent", sa.String(length=32), nullable=False, server_default="unknown"))
    op.add_column("leads", sa.Column("trust_stage", sa.String(length=32), nullable=False, server_default="curious"))
    op.add_column("leads", sa.Column("trust_source", sa.String(length=64), nullable=True))
    op.add_column("leads", sa.Column("dream_category", sa.String(length=64), nullable=True))
    op.add_column("leads", sa.Column("primary_goal", sa.Text(), nullable=True))
    op.add_column("leads", sa.Column("objection_summary", sa.Text(), nullable=True))
    op.add_column("leads", sa.Column("consumer_route_stage", sa.String(length=32), nullable=False, server_default="not_started"))

    op.add_column("daily_reports", sa.Column("new_connections", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("daily_reports", sa.Column("followup_conversations", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("daily_reports", sa.Column("product_story_shares", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("daily_reports", sa.Column("dream_conversations", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("daily_reports", "dream_conversations")
    op.drop_column("daily_reports", "product_story_shares")
    op.drop_column("daily_reports", "followup_conversations")
    op.drop_column("daily_reports", "new_connections")

    op.drop_column("leads", "consumer_route_stage")
    op.drop_column("leads", "objection_summary")
    op.drop_column("leads", "primary_goal")
    op.drop_column("leads", "dream_category")
    op.drop_column("leads", "trust_source")
    op.drop_column("leads", "trust_stage")
    op.drop_column("leads", "prospect_intent")

    op.drop_index("ix_users_mentor_user_id", table_name="users")
    op.drop_constraint("fk_users_mentor_user_id_users", "users", type_="foreignkey")
    op.drop_column("users", "mentor_user_id")
    op.drop_column("users", "product_experience_notes")
    op.drop_column("users", "story_spine")
    op.drop_column("users", "why_statement")
    op.drop_column("users", "dream_statement")
    op.drop_column("users", "dream_category")
    op.drop_column("users", "product_ritual_status")
    op.drop_column("users", "aadhaar_status")
    op.drop_column("users", "pan_status")
    op.drop_column("users", "kyc_status")
    op.drop_column("users", "primary_training_track")
    op.drop_column("users", "flp_rank")
    op.drop_column("users", "flp_identity_stage")
    op.drop_column("users", "hybrid_model_path")
