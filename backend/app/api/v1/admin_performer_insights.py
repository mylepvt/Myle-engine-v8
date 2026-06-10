"""Admin Performer Insights — intelligent ranking of genuine contributors."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.performer_insights_service import PerformerInsightsService

router = APIRouter()


@router.get("/performer-insights")
async def admin_performer_insights(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=7, le=90, description="Analysis period in days"),
    min_reports: int = Query(default=1, ge=0, le=90, description="Minimum reports to include"),
) -> dict:
    """Get intelligent performer insights — who is genuinely working."""
    if user.role != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Admin only",
        )

    service = PerformerInsightsService(session)
    try:
        return await service.get_performer_insights(days=days, min_reports=min_reports)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute performer insights: {str(e)}",
        )
