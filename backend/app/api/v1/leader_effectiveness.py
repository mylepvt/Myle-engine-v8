from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.leader_effectiveness import (
    LeaderEffectivenessPublic,
    LeaderEffectivenessResponse,
)
from app.services import leader_effectiveness_service as svc

router = APIRouter()


@router.get(
    "/admin/leader-effectiveness",
    response_model=LeaderEffectivenessResponse,
)
async def admin_leader_effectiveness(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.compute_leader_effectiveness(session)


@router.get(
    "/leader/effectiveness",
    response_model=LeaderEffectivenessPublic,
)
async def leader_own_effectiveness(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leader or admin only")
    result = await svc.get_leader_own_effectiveness(session, user.user_id)
    if result is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Leader effectiveness not available (no team members assigned?)",
        )
    return result
