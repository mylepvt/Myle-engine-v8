"""Other nav: leaderboard, notices, live session, training, daily report."""

from __future__ import annotations

import os
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.announcement import Announcement
from app.models.app_setting import AppSetting
from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.models.training_day_note import TrainingDayNote
from app.models.training_video import TrainingVideo
from app.models.user import User
from app.schemas.notice_board import AnnouncementCreate, AnnouncementOut, NoticeBoardResponse
from app.schemas.system_surface import SystemStubResponse, TrainingSurfaceResponse
from app.services.team_reports_metrics import IST
from app.services.training_surface import build_training_surface

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
_UPLOADS_NOTES = _BACKEND_ROOT / "uploads" / "training_notes"
_UPLOADS_AUDIO = _BACKEND_ROOT / "uploads" / "training_audio"

router = APIRouter()


def _require_leader_or_team(user: AuthUser) -> None:
    if user.role not in ("leader", "team"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_leader_team_or_admin(user: AuthUser) -> None:
    """Legacy ``/training`` is team/leader; admins use the same catalog in practice."""
    if user.role not in ("leader", "team", "admin"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _acting_label(user: AuthUser) -> str:
    if user.username and user.username.strip():
        return user.username.strip()
    if user.fbo_id:
        return user.fbo_id
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0]
    return str(user.user_id)


@router.get("/leaderboard", response_model=SystemStubResponse)
async def other_leaderboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Public leaderboard — mirrors legacy ``/leaderboard`` *points board* section.

    Legacy (``social_routes.leaderboard``): approved ``team`` rows only, top 20 by
    ``users.total_points`` (with empty-DB fallback to all approved users). vl2 has no
    ``total_points`` column; ranking uses **sum of** ``daily_scores.points`` (lifetime-style).
    """
    _ = user
    team_approved_ct = int(
        (
            await session.execute(
                select(func.count())
                .select_from(User)
                .where(User.role == "team", User.registration_status == "approved")
            )
        ).scalar_one()
    )
    # Legacy: if no approved team members, show all approved users so the board is not blank.
    lb_conds = [User.registration_status == "approved"]
    if team_approved_ct > 0:
        lb_conds.append(User.role == "team")

    stmt = (
        select(
            User.id,
            User.fbo_id,
            User.username,
            User.email,
            User.role,
            func.coalesce(func.sum(DailyScore.points), 0).label("pts"),
            func.coalesce(User.xp_total, 0).label("xp"),
            func.coalesce(User.xp_level, "rookie").label("lvl"),
        )
        .select_from(User)
        .outerjoin(DailyScore, DailyScore.user_id == User.id)
        .where(and_(*lb_conds))
        .group_by(User.id, User.fbo_id, User.username, User.email, User.role, User.xp_total, User.xp_level)
        .order_by(desc("pts"))
        .limit(20)
    )
    rows = (await session.execute(stmt)).all()
    items: list[dict] = []
    for rank, r in enumerate(rows, start=1):
        _uid, fbo, uname, email, role, pts, xp, lvl = r
        label = (uname or "").strip() or (email.split("@", 1)[0] if email else "") or fbo
        items.append(
            {
                "title": f"#{rank} {label}",
                "detail": f"{role} · {email} · total points: {int(pts)} · xp: {int(xp)} · level: {lvl or 'rookie'}",
                "count": rank,
            }
        )
    scope = "approved team" if team_approved_ct > 0 else "all approved users (legacy empty-team fallback)"
    return SystemStubResponse(
        items=items,
        total=len(items),
        note=(
            f"Top 20 by summed `daily_scores.points` ({scope}). "
            "Legacy Flask used `users.total_points` + `daily_scores` for today only; "
            "see `backend/legacy/myle_dashboard_main3/routes/social_routes.py` leaderboard()."
        ),
    )


@router.get("/notice-board", response_model=NoticeBoardResponse)
async def other_notice_board_list(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
) -> NoticeBoardResponse:
    """All logged-in roles — pinned first, then newest (legacy ``/announcements``)."""
    _ = user
    total_q = await session.execute(select(func.count()).select_from(Announcement))
    total = int(total_q.scalar_one())
    stmt = (
        select(Announcement)
        .order_by(Announcement.pin.desc(), Announcement.created_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    items = [AnnouncementOut.model_validate(r) for r in rows]
    return NoticeBoardResponse(items=items, total=total, note=None)


@router.post(
    "/notice-board",
    response_model=AnnouncementOut,
    status_code=http_status.HTTP_201_CREATED,
)
async def other_notice_board_create(
    body: AnnouncementCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementOut:
    _require_admin(user)
    row = Announcement(
        message=body.message.strip(),
        created_by=_acting_label(user),
        pin=body.pin,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return AnnouncementOut.model_validate(row)


@router.delete("/notice-board/{announcement_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def other_notice_board_delete(
    announcement_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    _require_admin(user)
    row = await session.get(Announcement, announcement_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(row)
    await session.commit()


@router.post(
    "/notice-board/{announcement_id}/toggle-pin",
    response_model=AnnouncementOut,
)
async def other_notice_board_toggle_pin(
    announcement_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementOut:
    _require_admin(user)
    row = await session.get(Announcement, announcement_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    row.pin = not row.pin
    await session.commit()
    await session.refresh(row)
    return AnnouncementOut.model_validate(row)


@router.get("/live-session", response_model=SystemStubResponse)
async def other_live_session(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Live / Zoom card — reads vl2 keys first, then legacy Flask ``_get_setting`` keys.

    Legacy ``social_routes.live_session``: ``zoom_link``, ``zoom_title``, ``zoom_time``,
    ``paper_plan_link`` (see ``myle_dashboard_main3/routes/social_routes.py``).
    """
    _ = user

    async def _get(key: str) -> str | None:
        row = await session.get(AppSetting, key)
        return row.value if row and row.value else None

    title = (
        (await _get("live_session_title"))
        or (await _get("zoom_title"))
        or "Today's Live Session"
    )
    url = ((await _get("live_session_url")) or (await _get("zoom_link")) or "").strip()
    sched_custom = (await _get("live_session_schedule")) or ""
    if sched_custom.strip():
        sched = sched_custom.strip()
    else:
        parts: list[str] = []
        zt = (await _get("zoom_time")) or ""
        if zt.strip():
            parts.append(zt.strip() if zt.strip().lower().startswith("scheduled") else f"Scheduled: {zt.strip()}")
        pp = (await _get("paper_plan_link")) or ""
        if pp.strip():
            parts.append(f"Paper plan: {pp.strip()}")
        sched = (
            " · ".join(parts)
            if parts
            else (
                "Set `zoom_link` + `zoom_title` + `zoom_time` (legacy keys) or "
                "`live_session_url` / `live_session_title` / `live_session_schedule` in app_settings."
            )
        )
    items: list[dict] = []
    if url.strip():
        items.append(
            {
                "title": title,
                "detail": sched,
                "external_href": url.strip(),
            }
        )
    else:
        items.append(
            {
                "title": title,
                "detail": sched,
            }
        )
    return SystemStubResponse(
        items=items,
        total=len(items),
        note=(
            "Reads `app_settings`: vl2 keys `live_session_*` or legacy Flask keys "
            "`zoom_link`, `zoom_title`, `zoom_time`, `paper_plan_link` "
            "(``social_routes.live_session``)."
        ),
    )


@router.get("/training", response_model=TrainingSurfaceResponse)
async def other_training(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingSurfaceResponse:
    _require_leader_team_or_admin(user)
    return await build_training_surface(session, user.user_id)


class UpdateTrainingDayBody(BaseModel):
    title: Optional[str] = None
    youtube_url: Optional[str] = None


@router.patch("/training/days/{day_number}")
async def update_training_day(
    day_number: int,
    body: UpdateTrainingDayBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: update title and/or youtube_url for a training day."""
    _require_admin(user)
    row = (
        await session.execute(select(TrainingVideo).where(TrainingVideo.day_number == day_number))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Training day not found")
    if body.title is not None:
        row.title = body.title.strip()
    if body.youtube_url is not None:
        row.youtube_url = body.youtube_url.strip() or None
    await session.commit()
    return {"day_number": day_number, "title": row.title, "youtube_url": row.youtube_url}


@router.post("/training/days/{day_number}/audio")
async def upload_training_audio(
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
    _UPLOADS_AUDIO.mkdir(parents=True, exist_ok=True)
    dest = _UPLOADS_AUDIO / f"day_{day_number}.mp3"
    contents = await file.read()
    dest.write_bytes(contents)
    audio_path = f"/uploads/training_audio/day_{day_number}.mp3"
    row.audio_url = audio_path
    await session.commit()
    return {"day_number": day_number, "audio_url": audio_path}


@router.post("/training/days/{day_number}/notes")
async def upload_training_notes(
    day_number: int,
    file: Annotated[UploadFile, File()],
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Team/leader/admin: upload notes image for a training day."""
    _require_leader_team_or_admin(user)
    _UPLOADS_NOTES.mkdir(parents=True, exist_ok=True)
    dest = _UPLOADS_NOTES / f"{user.user_id}_{day_number}.jpg"
    contents = await file.read()
    dest.write_bytes(contents)
    image_path = f"/uploads/training_notes/{user.user_id}_{day_number}.jpg"

    existing = (
        await session.execute(
            select(TrainingDayNote).where(
                TrainingDayNote.user_id == user.user_id,
                TrainingDayNote.day_number == day_number,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.image_url = image_path
    else:
        session.add(
            TrainingDayNote(
                user_id=user.user_id,
                day_number=day_number,
                image_url=image_path,
            )
        )
    await session.commit()
    return {"day_number": day_number, "image_url": image_path}


@router.get("/daily-report", response_model=SystemStubResponse)
async def other_daily_report(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    report_date: Optional[date] = Query(
        default=None,
        description="Calendar day (defaults to today IST; form uses local date picker)",
    ),
) -> SystemStubResponse:
    """Surface copy + hint for last saved row (full form uses POST /reports/daily)."""
    _require_leader_or_team(user)
    rd = report_date or datetime.now(IST).date()
    r = await session.execute(
        select(DailyReport).where(
            DailyReport.user_id == user.user_id,
            DailyReport.report_date == rd,
        )
    )
    row = r.scalar_one_or_none()
    items: list[dict] = []
    if row:
        items.append(
            {
                "title": f"Saved report · {row.report_date.isoformat()}",
                "detail": (
                    f"Total calling: {row.total_calling}; remarks: "
                    f"{(row.remarks or '')[:120]}"
                    f"{'…' if row.remarks and len(row.remarks) > 120 else ''}"
                ),
            }
        )
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Submit or update your numbers via the daily report form (POST /api/v1/reports/daily).",
    )
