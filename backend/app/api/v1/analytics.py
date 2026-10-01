"""Analytics — activity from live leads; funnel report by status."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.activity_log import ActivityLog
from app.models.user import User as UserModel
from app.services.downline import recursive_downline_user_ids
from app.services.member_activity_map import build_activity_map

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/activity-log")
async def analytics_activity_log(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    days: int = Query(default=30, ge=1, le=365),
    filter_action: str | None = Query(default=None, alias="action"),
    filter_user_id: int | None = Query(default=None, alias="user_id"),
    filter_entity_type: str | None = Query(default=None, alias="entity_type"),
) -> dict[str, Any]:
    """Paginated, filterable audit log. Admin sees all; others see only own entries."""
    is_admin = user.role == "admin"

    filters: list[Any] = []
    if not is_admin:
        filters.append(ActivityLog.user_id == user.user_id)
    elif filter_user_id:
        filters.append(ActivityLog.user_id == filter_user_id)

    if filter_action:
        filters.append(ActivityLog.action == filter_action)
    if filter_entity_type:
        filters.append(ActivityLog.entity_type == filter_entity_type)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    filters.append(ActivityLog.created_at >= since)

    where = and_(*filters) if filters else True

    total: int = (
        await session.execute(
            select(func.count()).select_from(ActivityLog).where(where)
        )
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await session.execute(
            select(
                ActivityLog,
                UserModel.name.label("u_name"),
                UserModel.username.label("u_username"),
                UserModel.fbo_id.label("u_fbo_id"),
            )
            .join(UserModel, UserModel.id == ActivityLog.user_id)
            .where(where)
            .order_by(ActivityLog.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    items = [
        {
            "id": r.ActivityLog.id,
            "user_id": r.ActivityLog.user_id,
            "actor": r.u_name or r.u_username or r.u_fbo_id,
            "action": r.ActivityLog.action,
            "entity_type": r.ActivityLog.entity_type,
            "entity_id": r.ActivityLog.entity_id,
            "meta": r.ActivityLog.meta,
            "ip_address": r.ActivityLog.ip_address,
            "created_at": r.ActivityLog.created_at.isoformat(),
        }
        for r in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/member-activity-map")
async def member_activity_map(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    user_id: int = Query(..., description="Target member"),
    days: int = Query(default=30, ge=0, le=365, description="0 = lifetime"),
) -> dict[str, Any]:
    """Per-member behavior map from activity_log. Admin: any member; leader:
    own downline; everyone: themselves."""
    if user.role != "admin" and user_id != user.user_id:
        if user.role == "leader":
            downline = await recursive_downline_user_ids(session, user.user_id)
            if user_id not in set(downline):
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Out of your scope")
        else:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return await build_activity_map(session, user_id=user_id, days=days)
