"""Process rewards: my MYLE Points, jackpot tickets, pipeline meter; admin audit + revoke."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.process_reward import ProcessPoint
from app.models.user import User
from app.services import process_rewards as pr
from app.services import rewards_extras as rx

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/me")
async def my_rewards(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    me = await session.get(User, user.user_id) or User(id=user.user_id, role=user.role)
    base = await pr.my_rewards(session, me)
    if not base["eligible"]:
        return base
    return {**base, **(await rx.my_extras(session, me, base))}


@router.post("/scratch/{card_id}")
async def scratch_card(
    card_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Reveal a scratch card — the prize is decided on the server."""
    try:
        card = await rx.scratch(session, card_id, user.user_id, datetime.now(timezone.utc))
    except rx.ScratchError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"id": card.id, "amount_rupees": card.amount_cents // 100, "bonus_points": card.bonus_points}


@router.get("/admin/points")
async def admin_points(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=7, ge=1, le=60),
) -> dict:
    _require_admin(user)
    return {"points": await pr.admin_points(session, days)}


@router.post("/admin/points/{point_id}/revoke")
async def admin_revoke_point(
    point_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Take back points that look wrong. They never come back on a later scan."""
    _require_admin(user)
    point = await session.get(ProcessPoint, point_id)
    if point is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    if point.revoked_at is None or point.revoked_reason != "admin":
        point.revoked_at = datetime.now(timezone.utc)
        point.revoked_reason = "admin"
        await session.commit()
    return {"ok": True, "id": point.id}


@router.get("/admin/draws")
async def admin_draws(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    return {"draws": await pr.admin_draws(session)}


@router.get("/admin/overview")
async def admin_overview(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    return await rx.admin_overview(session)


class PowerHourBody(BaseModel):
    enabled: bool
    start: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    end: str = Field(pattern=r"^\d{1,2}:\d{2}$")


@router.put("/admin/power-hour")
async def admin_power_hour(
    body: PowerHourBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    if pr._hhmm(body.start, "18:00") >= pr._hhmm(body.end, "19:00"):
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="End must be after start")
    return await pr.save_power_hour_config(session, body.enabled, body.start, body.end)


class SeasonPaidBody(BaseModel):
    user_id: int
    paid: bool = True


@router.post("/admin/season/{month}/paid")
async def admin_season_paid(
    month: date,
    body: SeasonPaidBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin handed over the cash / gift → record it."""
    _require_admin(user)
    result = await rx.mark_season_paid(session, month.replace(day=1), body.user_id, body.paid, datetime.now(timezone.utc))
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Season not closed yet")
    return {"month": result.month.isoformat(), "winners": result.winners}
