"""Daily attendance check-in / check-out with GPS and activity heartbeat."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import today_ist
from app.models.daily_check_in import DailyCheckIn
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter()

_SUSPICIOUS_ACCURACY_THRESHOLD = 500.0  # metres
_AWAY_THRESHOLD_MINUTES = 30


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckInRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None


class CheckOutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None


def _status(row: DailyCheckIn) -> str:
    if row.check_out_at:
        return "done"
    now = datetime.now(timezone.utc)
    if row.last_active_at and (now - row.last_active_at) < timedelta(minutes=_AWAY_THRESHOLD_MINUTES):
        return "active"
    return "away"


def _serialise(row: DailyCheckIn, actor_name: str | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "actor": actor_name,
        "date": str(row.date),
        "check_in_at": row.check_in_at.isoformat() if row.check_in_at else None,
        "check_out_at": row.check_out_at.isoformat() if row.check_out_at else None,
        "last_active_at": row.last_active_at.isoformat() if row.last_active_at else None,
        "work_duration_minutes": row.work_duration_minutes,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "accuracy_meters": row.accuracy_meters,
        "is_suspicious": row.is_suspicious,
        "status": _status(row),
    }


# ── My check-in status for today ─────────────────────────────────────────────

@router.get("/today")
async def get_my_checkin_today(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    today = today_ist()
    row = (
        await session.execute(
            select(DailyCheckIn).where(
                DailyCheckIn.user_id == user.user_id,
                DailyCheckIn.date == today,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return {"checked_in": False, "checked_out": False, "date": str(today)}
    return {"checked_in": True, **_serialise(row)}


# ── Check in ─────────────────────────────────────────────────────────────────

@router.post("")
async def check_in(
    body: CheckInRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    today = today_ist()
    existing = (
        await session.execute(
            select(DailyCheckIn).where(
                DailyCheckIn.user_id == user.user_id,
                DailyCheckIn.date == today,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return {"checked_in": True, "already": True, **_serialise(existing)}

    now = datetime.now(timezone.utc)
    suspicious = (
        body.latitude is None
        or body.longitude is None
        or (body.accuracy_meters is not None and body.accuracy_meters > _SUSPICIOUS_ACCURACY_THRESHOLD)
    )

    row = DailyCheckIn(
        user_id=user.user_id,
        date=today,
        check_in_at=now,
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_meters=body.accuracy_meters,
        last_active_at=now,
        is_suspicious=suspicious,
    )
    session.add(row)
    await session.flush()
    await log_action(
        session=session,
        user_id=user.user_id,
        action="checkin.in",
        entity_type="daily_check_in",
        entity_id=row.id,
        meta={"date": str(today), "suspicious": suspicious},
    )
    await session.commit()
    await session.refresh(row)
    return {"checked_in": True, "already": False, **_serialise(row)}


# ── Check out ─────────────────────────────────────────────────────────────────

@router.post("/out")
async def check_out(
    body: CheckOutRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    today = today_ist()
    row = (
        await session.execute(
            select(DailyCheckIn).where(
                DailyCheckIn.user_id == user.user_id,
                DailyCheckIn.date == today,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Not checked in today.")
    if row.check_out_at:
        return {"checked_out": True, "already": True, **_serialise(row)}

    now = datetime.now(timezone.utc)
    duration = int((now - row.check_in_at).total_seconds() / 60)

    row.check_out_at = now
    row.checkout_latitude = body.latitude
    row.checkout_longitude = body.longitude
    row.checkout_accuracy_meters = body.accuracy_meters
    row.work_duration_minutes = duration
    row.last_active_at = now

    await log_action(
        session=session,
        user_id=user.user_id,
        action="checkin.out",
        entity_type="daily_check_in",
        entity_id=row.id,
        meta={"date": str(today), "duration_minutes": duration},
    )
    await session.commit()
    await session.refresh(row)
    return {"checked_out": True, "already": False, **_serialise(row)}


# ── Heartbeat ─────────────────────────────────────────────────────────────────

@router.post("/heartbeat")
async def heartbeat(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Lightweight ping — updates last_active_at while user is in the app."""
    today = today_ist()
    row = (
        await session.execute(
            select(DailyCheckIn).where(
                DailyCheckIn.user_id == user.user_id,
                DailyCheckIn.date == today,
                DailyCheckIn.check_out_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row:
        row.last_active_at = datetime.now(timezone.utc)
        await session.commit()
    return {"ok": "1"}


# ── Team view (leader / admin) ────────────────────────────────────────────────

@router.get("/team")
async def get_team_checkins(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    date_str: Optional[str] = Query(default=None, alias="date"),
) -> dict[str, Any]:
    if user.role not in ("leader", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")

    target_date: date
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid date")
    else:
        target_date = today_ist()

    # Scope: admin sees all non-admin users; leader sees direct downline
    if user.role == "admin":
        user_filter = User.role.in_(("leader", "team"))
    else:
        user_filter = User.upline_user_id == user.user_id

    # All team members in scope
    members = (
        await session.execute(
            select(User.id, User.name, User.username, User.fbo_id)
            .where(user_filter)
            .order_by(User.name)
        )
    ).all()

    # Their check-ins for target_date
    member_ids = [m.id for m in members]
    checkins: dict[int, DailyCheckIn] = {}
    if member_ids:
        rows = (
            await session.execute(
                select(DailyCheckIn).where(
                    DailyCheckIn.user_id.in_(member_ids),
                    DailyCheckIn.date == target_date,
                )
            )
        ).scalars().all()
        checkins = {r.user_id: r for r in rows}

    items = []
    for m in members:
        display = m.name or m.username or m.fbo_id
        row = checkins.get(m.id)
        if row:
            items.append({**_serialise(row, actor_name=display)})
        else:
            items.append({
                "user_id": m.id,
                "actor": display,
                "date": str(target_date),
                "checked_in": False,
                "status": "absent",
                "check_in_at": None,
                "check_out_at": None,
                "last_active_at": None,
                "work_duration_minutes": None,
                "is_suspicious": False,
            })

    checked_in = sum(1 for i in items if i.get("check_in_at"))
    active = sum(1 for i in items if i.get("status") == "active")

    return {
        "date": str(target_date),
        "total": len(items),
        "checked_in": checked_in,
        "active": active,
        "items": items,
    }
