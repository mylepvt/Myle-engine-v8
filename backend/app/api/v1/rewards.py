"""Process rewards: my MYLE Points, jackpot tickets, pipeline meter; admin audit + revoke."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.process_reward import ProcessPoint
from app.models.user import User
from app.services import process_rewards as pr

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/me")
async def my_rewards(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    me = await session.get(User, user.user_id) or User(id=user.user_id, role=user.role)
    return await pr.my_rewards(session, me)


@router.get("/admin/points")
async def admin_points(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=7, ge=1, le=60),
) -> dict:
    _require_admin(user)
    return {"points": await pr.admin_points(session, days)}


@router.post("/admin/points/{point_id}/revoke")
async def admin_revoke_point(
    point_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Take back points that look wrong. They never come back on a later scan."""
    _require_admin(user)
    point = await session.get(ProcessPoint, point_id)
    if point is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    if point.revoked_at is None or point.revoked_reason != "admin":
        point.revoked_at = datetime.now(timezone.utc)
        point.revoked_reason = "admin"
        await session.commit()
    return {"ok": True, "id": point.id}


@router.get("/admin/draws")
async def admin_draws(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    return {"draws": await pr.admin_draws(session)}
