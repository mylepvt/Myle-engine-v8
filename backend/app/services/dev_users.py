"""Dev-only helpers for seeded accounts (see Alembic migration)."""

from __future__ import annotations

from app.constants.roles import DEV_EMAIL_BY_ROLE

__all__ = ["DEV_EMAIL_BY_ROLE", "dev_email_for_role"]


def dev_email_for_role(role: str) -> str:
    return DEV_EMAIL_BY_ROLE[role]
