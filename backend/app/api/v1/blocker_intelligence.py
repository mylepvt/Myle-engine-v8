from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.blocker_intelligence import BlockerIntelligence
from app.services import blocker_intelligence_service as svc

router = APIRouter()


@router.get(
    "/admin/blocker-intelligence",
    response_model=BlockerIntelligence,
)
async def admin_blocker_intelligence(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.compute_blocker_intelligence(session)
