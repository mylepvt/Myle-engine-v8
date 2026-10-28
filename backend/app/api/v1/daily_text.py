"""Daily text — admin sets one message per day; everyone reads it on Home.

Days are IST calendar dates. Admins may write and read any day (including
future days, to plan ahead); everyone else sees days up to today only.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import today_ist
from app.models.daily_text import DailyText

router = APIRouter()


class DailyTextEntry(BaseModel):
    headline: str
    body: str | None
    updated_at: str


class DailyTextResponse(BaseModel):
    date: str
    entry: DailyTextEntry | None


class DailyTextUpsert(BaseModel):
    headline: str = Field(..., max_length=300)
    body: str | None = Field(default=None, max_length=10_000)

    @field_validator("headline")
    @classmethod
    def _headline_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Headline is required")
        return v

    @field_validator("body")
    @classmethod
    def _body_trim(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change the daily text")


def _response(day: date, row: DailyText | None) -> DailyTextResponse:
    entry = (
        DailyTextEntry(headline=row.headline, body=row.body, updated_at=row.updated_at.isoformat())
        if row
        else None
    )
    return DailyTextResponse(date=day.isoformat(), entry=entry)


async def _get_row(session: AsyncSession, day: date) -> DailyText | None:
    return (await session.execute(select(DailyText).where(DailyText.text_date == day))).scalar_one_or_none()


@router.get("", response_model=DailyTextResponse)
async def get_daily_text(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    day: Annotated[date | None, Query(alias="date")] = None,
) -> DailyTextResponse:
    """The message for ``date`` (default: today IST). ``entry`` is null when none is set."""
    target = day or today_ist()
    if target > today_ist() and user.role != "admin":
        return _response(target, None)
    return _response(target, await _get_row(session, target))


@router.put("/{day}", response_model=DailyTextResponse)
async def put_daily_text(
    day: date,
    body: DailyTextUpsert,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DailyTextResponse:
    """Create or replace the message for one day (admin)."""
    _require_admin(user)
    row = await _get_row(session, day)
    if row is None:
        row = DailyText(text_date=day, headline=body.headline, body=body.body, updated_by_user_id=user.user_id)
        session.add(row)
    else:
        row.headline = body.headline
        row.body = body.body
        row.updated_by_user_id = user.user_id
    await session.commit()
    await session.refresh(row)
    return _response(day, row)


@router.delete("/{day}", response_model=DailyTextResponse)
async def delete_daily_text(
    day: date,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DailyTextResponse:
    """Remove the message for one day (admin)."""
    _require_admin(user)
    row = await _get_row(session, day)
    if row is not None:
        await session.delete(row)
        await session.commit()
    return _response(day, None)
