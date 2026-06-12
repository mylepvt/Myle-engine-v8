from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.org_execution import OrganizationScoreResponse
from app.services import org_execution_service as svc

router = APIRouter()


@router.get(
    "/admin/organization-score",
    response_model=OrganizationScoreResponse,
)
async def organization_score(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.compute_org_score(session)
