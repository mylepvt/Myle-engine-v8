from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, or_
from starlette import status as http_status

from app.api.deps import AuthUser
from app.core.lead_status import LEAD_STATUS_SET
from app.models.lead import Lead
from app.services.lead_scope import lead_visibility_where


def escape_ilike(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def parse_status_query(raw: Optional[str]) -> Optional[str]:
    if raw is None or raw.strip() == "":
        return None
    status = raw.strip()
    if status not in LEAD_STATUS_SET:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid status filter",
        )
    return status


def validate_list_flags(*, archived_only: bool, deleted_only: bool, user: AuthUser) -> None:
    if archived_only and deleted_only:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot combine archived_only and deleted_only",
        )


def lead_list_conditions(
    user: AuthUser,
    *,
    q: Optional[str],
    status_filter: Optional[str],
    archived_only: bool,
    deleted_only: bool,
):
    parts: list = []
    if archived_only or deleted_only:
        visibility = None if user.role == "admin" else Lead.assigned_to_user_id == user.user_id
    else:
        visibility = lead_visibility_where(user)
    if visibility is not None:
        parts.append(visibility)

    if deleted_only:
        parts.append(Lead.deleted_at.is_not(None))
    else:
        parts.append(Lead.deleted_at.is_(None))
        parts.append(Lead.in_pool.is_(False))
        if archived_only:
            parts.append(Lead.archived_at.is_not(None))
        else:
            parts.append(Lead.archived_at.is_(None))

    if q is not None and (needle := q.strip()):
        pattern = f"%{escape_ilike(needle)}%"
        parts.append(
            or_(
                Lead.name.ilike(pattern, escape="\\"),
                Lead.phone.ilike(pattern, escape="\\"),
                Lead.email.ilike(pattern, escape="\\"),
            )
        )

    if status_filter is not None:
        parts.append(Lead.status == status_filter)

    return and_(*parts) if parts else None
