"""Leader control room — live team status + one-tap nudge."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.control_room import NudgeError, build_control_room, send_leader_nudge

router = APIRouter()


@router.get("")
async def get_control_room(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leaders only")
    return await build_control_room(session, viewer_id=user.user_id, viewer_role=user.role)


@router.post("/{member_id}/nudge")
async def nudge_member(
    member_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    try:
        return await send_leader_nudge(session, sender_id=user.user_id, sender_role=user.role, member_id=member_id)
    except NudgeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
