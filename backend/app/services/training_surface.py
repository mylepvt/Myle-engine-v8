"""Shared training catalog + user progress payload (System + Other nav)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Dict

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
from app.services.training_uploads import normalize_training_audio_url


def _calculate_unlock_day_map(progress_rows: list[TrainingProgressRow]) -> Dict[int, date]:
    """Return the calendar date when each later day becomes available."""
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

    unlock_dates: Dict[int, date] = {}
    for day in range(2, 8):
        unlock_dates[day] = day1_date.date() + timedelta(days=day - 1)

    return unlock_dates


def _calculate_unlock_dates(progress_rows: list[TrainingProgressRow]) -> Dict[int, str]:
    unlock_day_map = _calculate_unlock_day_map(progress_rows)
    return {day: unlock_date.strftime('%d %b %Y') for day, unlock_date in unlock_day_map.items()}


def _is_unlocked(
    day_number: int,
    progress_rows: list[TrainingProgressRow],
    unlock_day_map: Dict[int, date],
) -> bool:
    """Match the legacy calendar discipline: previous day complete + date reached."""
    if day_number == 1:
        return True
    if any(p.day_number == day_number and p.completed for p in progress_rows):
        return True
    if not any(p.day_number == day_number - 1 and p.completed for p in progress_rows):
        return False
    unlock_date = unlock_day_map.get(day_number)
    if unlock_date is None:
        return False
    return datetime.now(UTC).date() >= unlock_date


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

    unlock_day_map = _calculate_unlock_day_map(progress)
    unlock_dates = _calculate_unlock_dates(progress)

    videos = [
        TrainingVideoRow(
            day_number=v.day_number,
            title=v.title,
            has_video=bool(v.youtube_url),
            youtube_url=v.youtube_url,
            audio_url=normalize_training_audio_url(getattr(v, "audio_url", None)),
            unlocked=_is_unlocked(v.day_number, progress, unlock_day_map),
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
