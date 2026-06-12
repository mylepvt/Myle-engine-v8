from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.predictive_risk import PredictiveRiskResponse
from app.services import predictive_risk_service as svc

router = APIRouter()


@router.get(
    "/admin/predictive-risk",
    response_model=PredictiveRiskResponse,
)
async def admin_predictive_risk(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.compute_predictive_risk(session)


@router.get(
    "/leader/predictive-risk",
    response_model=list | PredictiveRiskResponse,
)
async def leader_predictive_risk(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leader or admin only")
    return await svc.compute_leader_team_risks(session, user.user_id)
