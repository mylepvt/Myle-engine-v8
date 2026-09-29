"""Skills & Personal Development training (post-unlock, non-blocking)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.skill_training import SkillTrainingProgress, SkillTrainingVideo
from app.models.user import User
from app.services.skill_training import (
    SKILL_TRAINING_DAYS,
    build_skill_training_surface,
    get_skill_training_overview,
    mark_skill_day_done,
    youtube_embed_url,
)

router = APIRouter()


async def _load_user(session: AsyncSession, actor: AuthUser) -> User:
    row = await session.get(User, actor.user_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    return row


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/skills-training")
async def skills_training(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await build_skill_training_surface(session, await _load_user(session, user))


@router.post("/skills-training/days/{day_number}/done")
async def skills_training_mark_done(
    day_number: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    row = await _load_user(session, user)
    try:
        await mark_skill_day_done(session, row, day_number)
    except LookupError as exc:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return await build_skill_training_surface(session, row)


@router.get("/skills-training/days/{day_number}/embed")
async def skills_training_embed(
    day_number: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    """Auth-gated YouTube embed redirect — only for days the caller has unlocked."""
    row = await _load_user(session, user)
    surface = await build_skill_training_surface(session, row)
    day = next((d for d in surface["days"] if d["day_number"] == day_number), None)
    if day is None or not day["unlocked"]:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not available")
    video = (
        await session.execute(
            select(SkillTrainingVideo).where(SkillTrainingVideo.day_number == day_number)
        )
    ).scalar_one_or_none()
    if video is None or not video.youtube_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not available")
    return RedirectResponse(url=youtube_embed_url(video.youtube_url), status_code=302)


@router.get("/skills-training/progress")
async def skills_training_progress(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_skill_training_overview(session, actor=user)


class SkillDayBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    youtube_url: Optional[str] = Field(default=None, max_length=500)


@router.put("/skills-training/admin/day/{day_number}")
async def admin_put_skill_day(
    day_number: int,
    body: SkillDayBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: create or update one skills-training day (title + YouTube link)."""
    _require_admin(user)
    if not 1 <= day_number <= SKILL_TRAINING_DAYS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Day must be between 1 and {SKILL_TRAINING_DAYS}",
        )
    row = (
        await session.execute(
            select(SkillTrainingVideo).where(SkillTrainingVideo.day_number == day_number)
        )
    ).scalar_one_or_none()
    if row is None:
        row = SkillTrainingVideo(day_number=day_number, title=f"Day {day_number}")
        session.add(row)
    if body.title is not None and body.title.strip():
        row.title = body.title.strip()
    if body.youtube_url is not None:
        row.youtube_url = body.youtube_url.strip() or None
    await session.commit()
    return {"day_number": day_number, "title": row.title, "youtube_url": row.youtube_url}


@router.delete("/skills-training/admin/day/{day_number}", status_code=http_status.HTTP_204_NO_CONTENT)
async def admin_delete_skill_day(
    day_number: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    _require_admin(user)
    await session.execute(delete(SkillTrainingProgress).where(SkillTrainingProgress.day_number == day_number))
    await session.execute(delete(SkillTrainingVideo).where(SkillTrainingVideo.day_number == day_number))
    await session.commit()

