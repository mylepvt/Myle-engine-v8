"""Dream capture endpoints."""
from __future__ import annotations

from datetime import date
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.dream_entry import DreamEntry
from app.models.user import User

router = APIRouter()

VALID_CATEGORIES = {"income", "time_freedom", "family", "home", "travel", "business", "other"}

CATEGORY_LABELS = {
    "income":        "Income Goal",
    "time_freedom":  "Time Freedom",
    "family":        "Family",
    "home":          "Home",
    "travel":        "Travel",
    "business":      "Own Business",
    "other":         "Other",
}


class DreamIn(BaseModel):
    category: str = "other"
    dream_text: str
    target_date: Optional[date] = None
    image_url: Optional[str] = None


def _serialize(d: DreamEntry) -> dict:
    return {
        "id": d.id,
        "user_id": d.user_id,
        "category": d.category,
        "category_label": CATEGORY_LABELS.get(d.category, d.category),
        "dream_text": d.dream_text,
        "target_date": d.target_date.isoformat() if d.target_date else None,
        "image_url": d.image_url,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
    }


@router.get("/me")
async def get_my_dream(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    row = (
        await session.execute(select(DreamEntry).where(DreamEntry.user_id == user.user_id))
    ).scalar_one_or_none()
    if row is None:
        return {}
    return _serialize(row)


@router.put("/me")
async def upsert_my_dream(
    body: DreamIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category. Valid: {sorted(VALID_CATEGORIES)}")
    if not body.dream_text.strip():
        raise HTTPException(status_code=422, detail="dream_text cannot be empty")

    row = (
        await session.execute(select(DreamEntry).where(DreamEntry.user_id == user.user_id))
    ).scalar_one_or_none()

    if row is None:
        row = DreamEntry(
            user_id=user.user_id,
            category=body.category,
            dream_text=body.dream_text.strip(),
            target_date=body.target_date,
            image_url=body.image_url,
        )
        session.add(row)
    else:
        row.category = body.category
        row.dream_text = body.dream_text.strip()
        row.target_date = body.target_date
        row.image_url = body.image_url

    await session.commit()
    await session.refresh(row)
    return _serialize(row)


@router.get("/team")
async def get_team_dreams(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> List[dict]:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")

    if user.role == "admin":
        user_ids = (
            await session.execute(select(User.id).where(User.removed_at.is_(None)))
        ).scalars().all()
    else:
        user_ids = (
            await session.execute(
                select(User.id).where(
                    User.upline_user_id == user.user_id,
                    User.removed_at.is_(None),
                )
            )
        ).scalars().all()

    if not user_ids:
        return []

    rows = (
        await session.execute(
            select(DreamEntry, User.name, User.fbo_id)
            .join(User, User.id == DreamEntry.user_id)
            .where(DreamEntry.user_id.in_(user_ids))
            .order_by(DreamEntry.updated_at.desc())
        )
    ).all()

    return [
        {
            **_serialize(d),
            "member_name": name or fbo_id,
            "fbo_id": fbo_id,
        }
        for d, name, fbo_id in rows
    ]


@router.delete("/me")
async def delete_my_dream(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    row = (
        await session.execute(select(DreamEntry).where(DreamEntry.user_id == user.user_id))
    ).scalar_one_or_none()
    if row:
        await session.delete(row)
        await session.commit()
    return {"deleted": row is not None}
