"""System section — training (DB-backed), coaching stubs; decision engine uses `shell_insights`."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.schemas.system_surface import (
    SystemStubResponse,
    TrainingProgressRow,
    TrainingSurfaceResponse,
    TrainingVideoRow,
)
from app.services.shell_insights import build_decision_engine_snapshot

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin_or_leader(user: AuthUser) -> None:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/training", response_model=TrainingSurfaceResponse)
async def system_training(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingSurfaceResponse:
    """7-day training catalog + caller's completion rows (legacy training home data)."""
    vq = await session.execute(select(TrainingVideo).order_by(TrainingVideo.day_number.asc()))
    videos = [
        TrainingVideoRow(
            day_number=v.day_number,
            title=v.title,
            youtube_url=v.youtube_url,
        )
        for v in vq.scalars().all()
    ]
    pq = await session.execute(
        select(TrainingProgress).where(TrainingProgress.user_id == user.user_id)
    )
    progress = [
        TrainingProgressRow(
            day_number=p.day_number,
            completed=bool(p.completed),
            completed_at=p.completed_at,
        )
        for p in pq.scalars().all()
    ]
    note = None if videos else "Training catalog is empty — admin can seed `training_videos`."
    return TrainingSurfaceResponse(videos=videos, progress=progress, note=note)


@router.get("/decision-engine", response_model=SystemStubResponse)
async def system_decision_engine(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Admin — pipeline signals (stale new leads, pool depth)."""
    _require_admin(user)
    return await build_decision_engine_snapshot(session, user)


@router.get("/coaching", response_model=SystemStubResponse)
async def system_coaching(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> SystemStubResponse:
    """Coaching panel data placeholder — admin and leader roles."""
    _require_admin_or_leader(user)
    return SystemStubResponse(
        note="Coaching tasks and metrics will be API-driven; V1 returns an empty list.",
    )
