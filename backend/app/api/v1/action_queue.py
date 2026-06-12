from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.action_queue import (
    ActionExecuteRequest,
    ActionExecuteResult,
    ActionQueueResponse,
)
from app.services import action_queue_service as svc

router = APIRouter()


@router.get("/action-queue", response_model=ActionQueueResponse)
async def get_action_queue(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """Ranked one-tap action list. Admin sees org-wide; leader sees own team."""
    if user.role == "admin":
        return await svc.get_action_queue(session, limit=limit)
    if user.role == "leader":
        return await svc.get_action_queue(session, leader_user_id=user.user_id, limit=limit)
    raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin or leader only")


@router.post("/action-queue/execute", response_model=ActionExecuteResult)
async def execute_action(
    body: ActionExecuteRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin or leader only")
    return await svc.execute_action(
        session,
        item_type=body.item_type,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        action=body.action,
        actor_user_id=user.user_id,
        actor_role=user.role,
    )
