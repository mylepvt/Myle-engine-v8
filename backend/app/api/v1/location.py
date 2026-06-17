"""Passive location tracking — team/leader pings their location; leader/admin views the team."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.models.user_location import UserLocation

router = APIRouter()


class LocationPingRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None


def _serialise(loc: UserLocation, name: str | None = None) -> dict[str, Any]:
    return {
        "user_id": loc.user_id,
        "name": name,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "accuracy_meters": loc.accuracy_meters,
        "city": loc.city,
        "state": loc.state,
        "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
    }


# ── Ping (team / leader reports their location) ───────────────────────────────

@router.post("/ping")
async def location_ping(
    body: LocationPingRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    if user.role not in ("team", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

    now = datetime.now(timezone.utc)

    existing = (
        await session.execute(
            select(UserLocation).where(UserLocation.user_id == user.user_id)
        )
    ).scalar_one_or_none()

    if existing:
        existing.latitude = body.latitude
        existing.longitude = body.longitude
        existing.accuracy_meters = body.accuracy_meters
        existing.city = body.city
        existing.state = body.state
        existing.updated_at = now
    else:
        session.add(UserLocation(
            user_id=user.user_id,
            latitude=body.latitude,
            longitude=body.longitude,
            accuracy_meters=body.accuracy_meters,
            city=body.city,
            state=body.state,
            updated_at=now,
        ))

    await session.commit()
    return {"ok": "1"}


# ── Team view (leader / admin sees team locations) ────────────────────────────

@router.get("/team")
async def get_team_locations(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if user.role == "admin":
        user_filter = User.role.in_(("leader", "team"))
    else:
        user_filter = User.upline_user_id == user.user_id

    members = (
        await session.execute(
            select(User.id, User.name, User.username, User.fbo_id)
            .where(user_filter)
            .order_by(User.name)
        )
    ).all()

    member_ids = [m.id for m in members]
    locs: dict[int, UserLocation] = {}
    if member_ids:
        rows = (
            await session.execute(
                select(UserLocation).where(UserLocation.user_id.in_(member_ids))
            )
        ).scalars().all()
        for r in rows:
            locs[r.user_id] = r

    items = []
    for m in members:
        display = m.name or m.username or m.fbo_id
        loc = locs.get(m.id)
        if loc:
            items.append(_serialise(loc, name=display))
        else:
            items.append({
                "user_id": m.id,
                "name": display,
                "latitude": None,
                "longitude": None,
                "accuracy_meters": None,
                "city": None,
                "state": None,
                "updated_at": None,
            })

    return {"total": len(items), "items": items}
