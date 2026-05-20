"""whatsapp_log activity table

Revision ID: 20260520_0060
Revises: 20260517_0059
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa

revision = "20260520_0060"
down_revision = "20260517_0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("direction", sa.String(4), nullable=False),
        sa.Column("message_type", sa.String(32), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("message_preview", sa.String(400), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("wa_message_id", sa.String(128), nullable=True),
        sa.Column("related_user_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_log_direction", "whatsapp_log", ["direction"])
    op.create_index("ix_whatsapp_log_message_type", "whatsapp_log", ["message_type"])
    op.create_index("ix_whatsapp_log_phone", "whatsapp_log", ["phone"])
    op.create_index("ix_whatsapp_log_status", "whatsapp_log", ["status"])
    op.create_index("ix_whatsapp_log_related_user_id", "whatsapp_log", ["related_user_id"])
    op.create_index("ix_whatsapp_log_created_at", "whatsapp_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_log_created_at", "whatsapp_log")
    op.drop_index("ix_whatsapp_log_related_user_id", "whatsapp_log")
    op.drop_index("ix_whatsapp_log_status", "whatsapp_log")
    op.drop_index("ix_whatsapp_log_phone", "whatsapp_log")
    op.drop_index("ix_whatsapp_log_message_type", "whatsapp_log")
    op.drop_index("ix_whatsapp_log_direction", "whatsapp_log")
    op.drop_table("whatsapp_log")
