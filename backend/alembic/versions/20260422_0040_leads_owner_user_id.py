"""sticky lead owner

Revision ID: 20260422_0040
Revises: 20260421_0039
Create Date: 2026-04-22 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260422_0040"
down_revision = "20260421_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_leads_owner_user_id_users",
        "leads",
        "users",
        ["owner_user_id"],
        ["id"],
    )
    op.create_index("ix_leads_owner_user_id", "leads", ["owner_user_id"])
    op.execute(
        """
        UPDATE leads
           SET owner_user_id = CASE
               WHEN in_pool THEN NULL
               ELSE created_by_user_id
           END
         WHERE owner_user_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_leads_owner_user_id", table_name="leads")
    op.drop_constraint("fk_leads_owner_user_id_users", "leads", type_="foreignkey")
    op.drop_column("leads", "owner_user_id")
