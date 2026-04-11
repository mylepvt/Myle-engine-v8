"""Seed primary admin account (Karanveer) — FBO login

Revision ID: 20250412_0013
Revises: 20250412_0012
Create Date: 2026-04-12

Inserts one admin row if FBO id is not already present.
Password hash matches ``DEV_LOGIN_BCRYPT_HASH`` (plain: ``myle-dev-login``) — rotate in production.

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "20250412_0013"
down_revision: Union[str, Sequence[str], None] = "20250412_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Same as app.core.passwords.DEV_LOGIN_BCRYPT_HASH / migration 20250410_0005
_DEV_LOGIN_BCRYPT_HASH = (
    "$2b$12$9Btds2bpJbyCRS7P2HUePeE6pJKr1DiIlPphCBt71eti7cNuViMjm"
)


def upgrade() -> None:
    op.execute(
        text(
            """
            INSERT INTO users (fbo_id, username, email, role, hashed_password)
            VALUES (
                '910900367506',
                'Karanveer singh',
                'karanveer.singh@myle.local',
                'admin',
                :h
            )
            ON CONFLICT (fbo_id) DO NOTHING
            """
        ).bindparams(h=_DEV_LOGIN_BCRYPT_HASH)
    )


def downgrade() -> None:
    op.execute(text("DELETE FROM users WHERE fbo_id = '910900367506'"))
