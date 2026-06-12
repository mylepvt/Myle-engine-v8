from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.lead_timeline import LeadTimelineResponse
from app.services import lead_timeline_service as svc

router = APIRouter()


@router.get(
    "/leads/{lead_id}/timeline",
    response_model=LeadTimelineResponse,
)
async def get_lead_timeline(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    result = await svc.get_lead_timeline(session, lead_id)
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return result
