"""whatsapp_inbound_messages table

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
        "whatsapp_inbound_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default=sa.text("'meta_cloud_api'")),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("phone_digits", sa.String(length=16), nullable=True),
        sa.Column("profile_name", sa.String(length=255), nullable=True),
        sa.Column("message_type", sa.String(length=64), nullable=False, server_default=sa.text("'text'")),
        sa.Column("message_text", sa.Text(), nullable=True),
        sa.Column("command_key", sa.String(length=64), nullable=True),
        sa.Column("wa_message_id", sa.String(length=128), nullable=True),
        sa.Column("reply_to_wa_message_id", sa.String(length=128), nullable=True),
        sa.Column("matched_lead_id", sa.Integer(), nullable=True),
        sa.Column("matched_user_id", sa.Integer(), nullable=True),
        sa.Column("matched_removal_outreach_id", sa.Integer(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["matched_lead_id"], ["leads.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["matched_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["matched_removal_outreach_id"], ["member_removal_outreach.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_inbound_messages_phone", "whatsapp_inbound_messages", ["phone"])
    op.create_index("ix_whatsapp_inbound_messages_phone_digits", "whatsapp_inbound_messages", ["phone_digits"])
    op.create_index("ix_whatsapp_inbound_messages_command_key", "whatsapp_inbound_messages", ["command_key"])
    op.create_index("ix_whatsapp_inbound_messages_wa_message_id", "whatsapp_inbound_messages", ["wa_message_id"])
    op.create_index(
        "ix_whatsapp_inbound_messages_reply_to_wa_message_id",
        "whatsapp_inbound_messages",
        ["reply_to_wa_message_id"],
    )
    op.create_index("ix_whatsapp_inbound_messages_matched_lead_id", "whatsapp_inbound_messages", ["matched_lead_id"])
    op.create_index("ix_whatsapp_inbound_messages_matched_user_id", "whatsapp_inbound_messages", ["matched_user_id"])
    op.create_index(
        "ix_whatsapp_inbound_messages_matched_removal_outreach_id",
        "whatsapp_inbound_messages",
        ["matched_removal_outreach_id"],
    )
    op.create_index("ix_whatsapp_inbound_messages_received_at", "whatsapp_inbound_messages", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_inbound_messages_received_at", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_matched_removal_outreach_id", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_matched_user_id", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_matched_lead_id", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_reply_to_wa_message_id", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_wa_message_id", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_command_key", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_phone_digits", table_name="whatsapp_inbound_messages")
    op.drop_index("ix_whatsapp_inbound_messages_phone", table_name="whatsapp_inbound_messages")
    op.drop_table("whatsapp_inbound_messages")
