"""Today's closing list for admins and leaders."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.closing_ready import closing_ready_today

router = APIRouter()


@router.get("/today")
async def get_closing_today(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Day 3 prospects with interview done + today's 2 PM session watched (admin: all; leader: own team)."""
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admins and leaders only")
    return {"items": await closing_ready_today(session, viewer_id=user.user_id, viewer_role=user.role)}
