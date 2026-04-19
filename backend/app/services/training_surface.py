"""Shared training catalog + user progress payload (System + Other nav)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.schemas.system_surface import (
    TrainingDayNoteRow,
    TrainingProgressRow,
    TrainingSurfaceResponse,
    TrainingVideoRow,
)


def _calculate_unlock_dates(progress_rows: list[TrainingProgressRow]) -> Dict[int, str]:
    """Calculate unlock dates for training days based on calendar enforcement."""
    day1_completion = next((p for p in progress_rows if p.day_number == 1 and p.completed_at), None)

    if not day1_completion or not day1_completion.completed_at:
        return {}

    try:
        completed_at_val = day1_completion.completed_at
        if isinstance(completed_at_val, str):
            day1_date = datetime.fromisoformat(completed_at_val.replace('Z', '+00:00'))
        else:
            day1_date = completed_at_val
    except (ValueError, AttributeError, TypeError):
        return {}

    unlock_dates = {}
    for day in range(2, 8):
        unlock_date = day1_date.date() + timedelta(days=day - 1)
        unlock_dates[day] = unlock_date.strftime('%d %b %Y')

    return unlock_dates


def _is_unlocked(day_number: int, progress_rows: list[TrainingProgressRow]) -> bool:
    """Day 1 always unlocked; Day N unlocked if Day N-1 is completed."""
    if day_number == 1:
        return True
    return any(p.day_number == day_number - 1 and p.completed for p in progress_rows)


async def build_training_surface(session: AsyncSession, user_id: int) -> TrainingSurfaceResponse:
    vq = await session.execute(select(TrainingVideo).order_by(TrainingVideo.day_number.asc()))
    video_rows = vq.scalars().all()

    pq = await session.execute(
        select(TrainingProgress).where(TrainingProgress.user_id == user_id)
    )
    progress = [
        TrainingProgressRow(
            day_number=p.day_number,
            completed=bool(p.completed),
            completed_at=p.completed_at.isoformat() if p.completed_at else None,
        )
        for p in pq.scalars().all()
    ]

    nq = await session.execute(
        select(TrainingDayNote).where(TrainingDayNote.user_id == user_id)
    )
    notes = [TrainingDayNoteRow(day_number=n.day_number) for n in nq.scalars().all()]

    # Calculate unlock dates for calendar enforcement
    unlock_dates = _calculate_unlock_dates(progress)

    videos = [
        TrainingVideoRow(
            day_number=v.day_number,
            title=v.title,
            youtube_url=v.youtube_url,
            audio_url=getattr(v, "audio_url", None),
            unlocked=_is_unlocked(v.day_number, progress),
        )
        for v in video_rows
    ]

    # Backward-compatible API contract:
    # tests and older clients expect a non-empty note when the catalog is empty.
    note = (
        "Training days are not configured yet. Please ask admin to add training content."
        if not videos
        else None
    )
    return TrainingSurfaceResponse(
        videos=videos,
        progress=progress,
        notes=notes,
        note=note,
        unlock_dates=unlock_dates,
    )
