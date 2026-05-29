"""merge grace_history and leads_is_reassigned heads

Production was migrated under a fork off 0063 (grace_history and
user_locations were independent branches), leaving two stamped heads in
alembic_version: 20260522_0064 (grace_history) and 20260525_0065
(leads_is_reassigned, via user_locations). This no-op merge unifies them
into a single head so `alembic upgrade head` converges.

Revision ID: 20260526_0066
Revises: 20260522_0064, 20260525_0065
Create Date: 2026-05-26

"""

revision = "20260526_0066"
down_revision = ("20260522_0064", "20260525_0065")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
