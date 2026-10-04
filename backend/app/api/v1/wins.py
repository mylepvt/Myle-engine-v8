"""Team wins feed — GET the latest wins, POST to cheer one."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.services.wins import list_wins, toggle_cheer

router = APIRouter()


@router.get("")
async def get_wins(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=50),
) -> dict:
    return {"items": await list_wins(session, viewer_id=user.user_id, limit=limit)}


@router.post("/{win_id}/cheer")
async def cheer_win(
    win_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    result = await toggle_cheer(session, win_id=win_id, user_id=user.user_id)
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Win not found")
    await notify_topics("wins")
    return result
