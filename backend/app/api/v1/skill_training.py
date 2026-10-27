"""Personal Development & Skills Academy (post-onboarding, non-blocking)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.skill_training import SkillLesson, SkillLessonProgress
from app.models.user import User
from app.services.skill_training import (
    CATEGORY_KEYS,
    PRACTICE_MAX_CHARS,
    build_skill_training_surface,
    complete_skill_lesson,
    get_skill_training_overview,
    skill_training_available,
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


class CompleteLessonBody(BaseModel):
    practice_response: Optional[str] = Field(default=None, max_length=PRACTICE_MAX_CHARS)


@router.post("/skills-training/lessons/{lesson_id}/complete")
async def skills_training_complete_lesson(
    lesson_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    body: Optional[CompleteLessonBody] = None,
) -> dict:
    row = await _load_user(session, user)
    try:
        await complete_skill_lesson(
            session, row, lesson_id, practice_response=body.practice_response if body else None
        )
    except LookupError as exc:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return await build_skill_training_surface(session, row)


@router.get("/skills-training/lessons/{lesson_id}/embed")
async def skills_training_embed(
    lesson_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    """Auth-gated YouTube embed redirect — only once the academy is unlocked for the caller."""
    row = await _load_user(session, user)
    lesson = await session.get(SkillLesson, lesson_id)
    if not skill_training_available(row) or lesson is None or not lesson.youtube_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not available")
    return RedirectResponse(url=youtube_embed_url(lesson.youtube_url), status_code=302)


@router.get("/skills-training/progress")
async def skills_training_progress(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_skill_training_overview(session, actor=user)


class LessonBody(BaseModel):
    category: Optional[str] = Field(default=None, max_length=32)
    position: Optional[int] = Field(default=None, ge=1, le=99)
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=4000)
    youtube_url: Optional[str] = Field(default=None, max_length=500)
    duration_minutes: Optional[int] = Field(default=None, ge=0, le=600)
    practice_task: Optional[str] = Field(default=None, max_length=4000)
    practice_required: Optional[bool] = None


def _admin_lesson(row: SkillLesson) -> dict:
    return {
        "id": int(row.id),
        "category": row.category,
        "position": int(row.position),
        "title": row.title,
        "description": row.description,
        "youtube_url": row.youtube_url,
        "duration_minutes": row.duration_minutes,
        "practice_task": row.practice_task,
        "practice_required": bool(row.practice_required),
    }


def _apply(row: SkillLesson, body: LessonBody) -> None:
    fields = body.model_fields_set
    if body.title is not None and body.title.strip():
        row.title = body.title.strip()
    if body.position is not None:
        row.position = body.position
    for name in ("description", "youtube_url", "practice_task"):
        if name in fields:
            value = getattr(body, name)
            setattr(row, name, (value or "").strip() or None)
    if "duration_minutes" in fields:
        row.duration_minutes = body.duration_minutes or None
    if body.practice_required is not None:
        row.practice_required = body.practice_required


@router.post("/skills-training/admin/lessons", status_code=http_status.HTTP_201_CREATED)
async def admin_create_lesson(
    body: LessonBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: add a lesson to a category (appended at the end unless a position is given)."""
    _require_admin(user)
    if body.category not in CATEGORY_KEYS:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown category")
    if not (body.title or "").strip():
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Title is required")
    last = (
        await session.execute(
            select(func.max(SkillLesson.position)).where(SkillLesson.category == body.category)
        )
    ).scalar()
    row = SkillLesson(category=body.category, position=int(last or 0) + 1, title=body.title.strip())
    _apply(row, body)
    session.add(row)
    await session.commit()
    return _admin_lesson(row)


@router.put("/skills-training/admin/lessons/{lesson_id}")
async def admin_update_lesson(
    lesson_id: int,
    body: LessonBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    row = await session.get(SkillLesson, lesson_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    if body.category is not None:
        if body.category not in CATEGORY_KEYS:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown category")
        row.category = body.category
    _apply(row, body)
    await session.commit()
    return _admin_lesson(row)


@router.delete("/skills-training/admin/lessons/{lesson_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def admin_delete_lesson(
    lesson_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Admin: remove a lesson (members' completions of it go with it)."""
    _require_admin(user)
    row = await session.get(SkillLesson, lesson_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    await session.execute(delete(SkillLessonProgress).where(SkillLessonProgress.lesson_id == lesson_id))
    await session.delete(row)
    await session.commit()
