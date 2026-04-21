"""Admin-only training catalog mutations (content, media)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.training_video import TrainingVideo
from app.services.training_uploads import remove_training_audio_file, save_training_audio_file

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


class UpdateTrainingDayBody(BaseModel):
    title: Optional[str] = None
    youtube_url: Optional[str] = None
    audio_url: Optional[str] = None


@router.put("/training/day/{day_number}")
async def admin_put_training_day(
    day_number: int,
    body: UpdateTrainingDayBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: update title and/or media URLs for a training day."""
    _require_admin(user)
    row = (
        await session.execute(select(TrainingVideo).where(TrainingVideo.day_number == day_number))
    ).scalar_one_or_none()
    if row is None:
        row = TrainingVideo(
            day_number=day_number,
            title=body.title or f"Day {day_number}",
        )
        session.add(row)
    if body.title is not None:
        row.title = body.title.strip()
    if body.youtube_url is not None:
        row.youtube_url = body.youtube_url.strip() or None
    if body.audio_url is not None:
        next_audio_url = body.audio_url.strip() or None
        if row.audio_url != next_audio_url:
            remove_training_audio_file(row.audio_url)
        row.audio_url = next_audio_url
    await session.commit()
    return {"day_number": day_number, "title": row.title, "youtube_url": row.youtube_url, "audio_url": row.audio_url}


@router.post("/training/day/{day_number}/audio")
async def admin_upload_training_audio(
    day_number: int,
    file: Annotated[UploadFile, File()],
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: upload audio file for a training day."""
    _require_admin(user)
    row = (
        await session.execute(select(TrainingVideo).where(TrainingVideo.day_number == day_number))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Training day not found")
    remove_training_audio_file(row.audio_url)
    audio_path = await save_training_audio_file(day_number, file)
    row.audio_url = audio_path
    await session.commit()
    return {"day_number": day_number, "audio_url": audio_path}
