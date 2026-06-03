"""Admin-only training catalog mutations (content, media)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.training_progress import TrainingProgress
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.training_video import TrainingVideo
from app.models.user import User
from app.services.training_overview import get_training_overview
from app.services.training_uploads import (
    normalize_training_audio_url,
    remove_training_audio_file,
    save_training_audio_file,
)

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
        next_audio_url = normalize_training_audio_url(body.audio_url)
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
    try:
        audio_path = await save_training_audio_file(day_number, file)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    row.audio_url = audio_path
    await session.commit()
    return {"day_number": day_number, "audio_url": audio_path}


@router.get("/training/progress")
async def admin_training_progress(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: per-member 7-day training progress grouped by team leader."""
    _require_admin(user)
    return await get_training_overview(session, actor=user)


async def _load_target(session: AsyncSession, user_id: int) -> User:
    target = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


@router.post("/training/{user_id}/toggle")
async def admin_toggle_training_requirement(
    user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: turn the training lock on/off for one member.

    On → off grants full access (``not_required``). Off → on locks access until the
    member finishes training (``pending`` unless a run is already in progress).
    """
    _require_admin(user)
    target = await _load_target(session, user_id)
    if target.training_required:
        target.training_required = False
        target.training_status = "not_required"
    else:
        target.training_required = True
        if target.training_status == "not_required":
            target.training_status = "pending"
    await session.commit()
    return {
        "user_id": user_id,
        "training_required": target.training_required,
        "training_status": target.training_status,
    }


@router.post("/training/{user_id}/reset")
async def admin_reset_training(
    user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: wipe a member's training progress + test attempts so they start over."""
    _require_admin(user)
    target = await _load_target(session, user_id)
    await session.execute(
        delete(TrainingProgress).where(TrainingProgress.user_id == user_id)
    )
    await session.execute(
        delete(TrainingTestAttempt).where(TrainingTestAttempt.user_id == user_id)
    )
    target.certificate_url = None
    if target.training_required:
        target.training_status = "pending"
    await session.commit()
    return {"user_id": user_id, "ok": True}
