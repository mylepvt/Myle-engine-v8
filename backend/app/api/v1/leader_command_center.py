from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.leader_command_center import LeaderCommandCenterResponse
from app.services import leader_command_center_service as svc

router = APIRouter()


@router.get(
    "/leader/command-center",
    response_model=LeaderCommandCenterResponse,
)
async def leader_command_center(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leader or admin only")
    return await svc.get_command_center(session, user.user_id)
