from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.eos_health import EosHealthResponse
from app.services import eos_health_service as svc

router = APIRouter()


@router.get(
    "/admin/eos-health",
    response_model=EosHealthResponse,
)
async def admin_eos_health(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.compute_eos_health(session)
