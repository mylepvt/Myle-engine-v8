"""Helpers for writing immutable audit trail entries."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog


async def log_action(
    *,
    session: AsyncSession,
    user_id: int,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Append an audit entry. Does NOT commit — caller must commit."""
    session.add(
        ActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=meta,
            ip_address=ip_address,
        )
    )
