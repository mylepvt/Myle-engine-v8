"""Shared training catalog + user progress payload (System + Other nav)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.schemas.system_surface import (
    TrainingProgressRow,
    TrainingSurfaceResponse,
    TrainingVideoRow,
)


async def build_training_surface(session: AsyncSession, user_id: int) -> TrainingSurfaceResponse:
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
        select(TrainingProgress).where(TrainingProgress.user_id == user_id)
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
