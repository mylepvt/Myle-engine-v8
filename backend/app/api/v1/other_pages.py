"""Other nav: leaderboard, notices, live session, training, daily report."""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.announcement import Announcement
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.premiere_viewer import PremiereViewer
from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.models.user import User
from app.schemas.notice_board import AnnouncementCreate, AnnouncementOut, NoticeBoardResponse
from app.schemas.system_surface import SystemStubResponse, TrainingSurfaceResponse
from app.services.enrollment_video import normalize_phone_for_match
from app.services.team_reports_metrics import IST
from app.services.training_surface import build_training_surface
from app.services.training_uploads import save_training_notes_image

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


async def _ensure_training_day_exists(session: AsyncSession, day_number: int) -> None:
    exists = await session.execute(
        select(TrainingVideo.id).where(TrainingVideo.day_number == day_number)
    )
    if exists.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Invalid training day",
        )


async def _ensure_day_unlocked_for_user(
    session: AsyncSession,
    *,
    user_id: int,
    day_number: int,
) -> None:
    if day_number <= 1:
        return
    previous = await session.execute(
        select(TrainingProgress.id).where(
            TrainingProgress.user_id == user_id,
            TrainingProgress.day_number == day_number - 1,
            TrainingProgress.completed.is_(True),
        )
    )
    if previous.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Complete Day {day_number - 1} first",
        )


def _acting_label(user: AuthUser) -> str:
    if user.username and user.username.strip():
        return user.username.strip()
    if user.fbo_id:
        return user.fbo_id
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0]
    return str(user.user_id)


def _is_missing_premiere_viewers_table_error(exc: Exception) -> bool:
    parts = [str(exc).lower()]
    original = getattr(exc, "orig", None)
    if original is not None:
        parts.append(str(original).lower())
    message = " ".join(parts)
    return "premiere_viewers" in message and (
        "no such table" in message
        or "does not exist" in message
        or "undefinedtable" in message
    )


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


@router.post("/training/days/{day_number}/notes")
async def upload_training_notes(
    day_number: int,
    file: Annotated[UploadFile, File()],
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Team/leader/admin: upload notes image for a training day."""
    _require_leader_team_or_admin(user)
    await _ensure_training_day_exists(session, day_number)
    await _ensure_day_unlocked_for_user(session, user_id=user.user_id, day_number=day_number)
    try:
        image_path = await save_training_notes_image(user.user_id, day_number, file)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

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


# ---------------------------------------------------------------------------
# Premiere — multi-session (hourly slots, prospect sees only current/next)
# ---------------------------------------------------------------------------

DEFAULT_SESSION_HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]


class PremiereStateResponse(BaseModel):
    state: Literal["upcoming", "waiting", "live", "ended"]
    video_url: Optional[str]
    waiting_starts_at: str
    live_starts_at: str
    live_ends_at: str
    session_hour: int
    premiere_link: str
    server_now: str
    viewer_count: int


class PremiereRegisterBody(BaseModel):
    viewer_id: str
    name: str
    city: str
    phone: str
    session_hour: int
    state: str


class PremiereHeartbeatBody(BaseModel):
    viewer_id: str
    session_hour: int
    state: str


class PremiereProgressBody(BaseModel):
    viewer_id: str
    session_hour: int
    current_time_sec: float
    percentage_watched: float
    watch_completed: bool = False


class PremiereViewerOut(BaseModel):
    viewer_id: str
    name: str
    masked_phone: str
    city: str
    session_date: str
    session_hour: int
    percentage_watched: float
    current_time_sec: float
    last_seen_at: Optional[str]
    first_seen_at: Optional[str]
    lead_score: int
    watch_completed: bool
    rejoined: bool
    referred_by_name: Optional[str] = None


class PremiereSlot(BaseModel):
    hour: int
    label: str          # "11:00 AM"
    state: Literal["past", "upcoming", "waiting", "live"]
    waiting_starts_at: str
    live_starts_at: str
    live_ends_at: str
    viewer_count_today: int


class PremiereScheduleResponse(BaseModel):
    slots: list[PremiereSlot]
    premiere_link: str
    active_hour: Optional[int]  # currently live/waiting hour


async def _get_session_config(db: AsyncSession) -> tuple[list[int], int, int]:
    """Return (sorted hours list, waiting_minutes, duration_minutes)."""
    async def _s(key: str) -> str:
        row = await db.get(AppSetting, key)
        return (row.value or "").strip() if row else ""

    raw_hours = await _s("premiere_session_hours") or ""
    if raw_hours.strip():
        try:
            hours = sorted({int(x.strip()) for x in raw_hours.split(",") if x.strip().isdigit()})
        except ValueError:
            hours = DEFAULT_SESSION_HOURS
    else:
        hours = DEFAULT_SESSION_HOURS

    wmin_raw = await _s("premiere_waiting_minutes") or "30"
    dmin_raw = await _s("premiere_duration_minutes") or "49"
    wmin = max(1, int(wmin_raw) if wmin_raw.isdigit() else 30)
    dmin = max(1, int(dmin_raw) if dmin_raw.isdigit() else 49)
    return hours, wmin, dmin


def _slot_window(today_ist: date, hour: int, wmin: int, dmin: int) -> tuple[datetime, datetime, datetime]:
    live_start = datetime(today_ist.year, today_ist.month, today_ist.day, hour, 0, tzinfo=IST)
    return live_start - timedelta(minutes=wmin), live_start, live_start + timedelta(minutes=dmin)


def _find_active_slot(
    hours: list[int], now: datetime, wmin: int, dmin: int
) -> tuple[datetime, datetime, datetime, int] | None:
    """Return (waiting_start, live_start, live_end, hour) for current or next slot.

    Prefer a slot whose WAITING window contains now (ws <= now < ls) over a
    currently-live earlier slot. This ensures users who receive a link 20-30 min
    before the next session see the correct waiting room rather than the tail of
    the previous live session.
    """
    today = now.date()
    # Priority 1: slot currently in waiting window (ws <= now < live_start)
    for h in hours:
        ws, ls, le = _slot_window(today, h, wmin, dmin)
        if ws <= now < ls:
            return ws, ls, le, h
    # Priority 2: first slot not yet ended (live or upcoming)
    for h in hours:
        ws, ls, le = _slot_window(today, h, wmin, dmin)
        if now <= le:
            return ws, ls, le, h
    return None


def _mask_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) >= 4:
        return digits[:2] + "****" + digits[-2:]
    return "****"


def _compute_score(viewer: PremiereViewer) -> int:
    score = 0
    if viewer.joined_waiting:
        score += 10
    if viewer.percentage_watched >= 0.70:
        score += 40
    elif viewer.current_time_sec >= 600:
        score += 20
    if viewer.watch_completed:
        score += 30
    if viewer.rejoined:
        score += 60
    return score


@router.get("/premiere", response_model=PremiereStateResponse)
async def get_premiere_state(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PremiereStateResponse:
    """Public — no auth. Returns current/next session state."""
    hours, wmin, dmin = await _get_session_config(db)
    now = datetime.now(IST)
    slot = _find_active_slot(hours, now, wmin, dmin)

    if slot is None:
        # All sessions done for today — show last slot as ended
        today = now.date()
        last_h = hours[-1] if hours else 21
        ws, ls, le = _slot_window(today, last_h, wmin, dmin)
        return PremiereStateResponse(
            state="ended",
            video_url=None,
            waiting_starts_at=ws.isoformat(),
            live_starts_at=ls.isoformat(),
            live_ends_at=le.isoformat(),
            session_hour=last_h,
            premiere_link="/premiere",
            server_now=now.isoformat(),
            viewer_count=0,
        )

    waiting_start, live_start, live_end, session_hour = slot

    if now < waiting_start:
        state: Literal["upcoming", "waiting", "live", "ended"] = "upcoming"
    elif now < live_start:
        state = "waiting"
    elif now <= live_end:
        state = "live"
    else:
        state = "ended"

    async def _s(key: str) -> str:
        row = await db.get(AppSetting, key)
        return (row.value or "").strip() if row else ""

    video_url: Optional[str] = None
    if state == "live":
        video_url = await _s("premiere_video_url") or await _s("enrollment_video_source_url") or None

    # Social proof viewer count (real + floor boost)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=45)
    today_str = now.date().isoformat()
    try:
        real_count = int((await db.execute(
            select(func.count()).select_from(PremiereViewer).where(
                PremiereViewer.session_date == today_str,
                PremiereViewer.session_hour == session_hour,
                PremiereViewer.last_seen_at >= cutoff,
            )
        )).scalar_one())
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        real_count = 0
    boosted = min(300, max(250, 250 + real_count)) if state in ("waiting", "live") else 0

    return PremiereStateResponse(
        state=state,
        video_url=video_url,
        waiting_starts_at=waiting_start.isoformat(),
        live_starts_at=live_start.isoformat(),
        live_ends_at=live_end.isoformat(),
        session_hour=session_hour,
        premiere_link="/premiere",
        server_now=now.isoformat(),
        viewer_count=boosted,
    )


@router.get("/premiere/schedule", response_model=PremiereScheduleResponse)
async def get_premiere_schedule(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PremiereScheduleResponse:
    """Auth required (team/leader/admin). Full daily schedule — not shown to prospects."""
    hours, wmin, dmin = await _get_session_config(db)
    now = datetime.now(IST)
    today = now.date()
    today_str = today.isoformat()

    # Viewer counts per hour for today
    try:
        counts_rows = (await db.execute(
            select(PremiereViewer.session_hour, func.count().label("cnt"))
            .where(PremiereViewer.session_date == today_str)
            .group_by(PremiereViewer.session_hour)
        )).all()
        counts: dict[int, int] = {r.session_hour: r.cnt for r in counts_rows}
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        counts = {}

    slots: list[PremiereSlot] = []
    active_hour: Optional[int] = None

    for h in hours:
        ws, ls, le = _slot_window(today, h, wmin, dmin)
        if now < ws:
            slot_state: Literal["past", "upcoming", "waiting", "live"] = "upcoming"
        elif now < ls:
            slot_state = "waiting"
            active_hour = h
        elif now <= le:
            slot_state = "live"
            active_hour = h
        else:
            slot_state = "past"

        label = ls.strftime("%-I:%M %p") if hasattr(ls, 'strftime') else f"{h}:00"
        slots.append(PremiereSlot(
            hour=h,
            label=label,
            state=slot_state,
            waiting_starts_at=ws.isoformat(),
            live_starts_at=ls.isoformat(),
            live_ends_at=le.isoformat(),
            viewer_count_today=counts.get(h, 0),
        ))

    return PremiereScheduleResponse(
        slots=slots,
        premiere_link="/premiere",
        active_hour=active_hour,
    )


@router.post("/premiere/register", status_code=201)
async def premiere_register(
    body: PremiereRegisterBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Public — no auth. Upsert viewer registration for this session slot."""
    today = datetime.now(IST).date().isoformat()
    now = datetime.now(timezone.utc)

    try:
        viewer = (await db.execute(
            select(PremiereViewer).where(
                PremiereViewer.viewer_id == body.viewer_id,
                PremiereViewer.session_date == today,
                PremiereViewer.session_hour == body.session_hour,
            )
        )).scalar_one_or_none()

        if viewer is None:
            # Check if same viewer has ANY record today (different slot) → mark rejoin
            prev = (await db.execute(
                select(PremiereViewer.id).where(
                    PremiereViewer.viewer_id == body.viewer_id,
                    PremiereViewer.session_date == today,
                )
            )).scalar_one_or_none()
            viewer = PremiereViewer(
                viewer_id=body.viewer_id,
                session_date=today,
                session_hour=body.session_hour,
                name=body.name.strip()[:200],
                city=body.city.strip()[:200],
                phone=body.phone.strip()[:30],
                first_seen_at=now,
                last_seen_at=now,
                rejoined=prev is not None,
            )
            db.add(viewer)
        else:
            viewer.name = body.name.strip()[:200]
            viewer.city = body.city.strip()[:200]
            viewer.phone = body.phone.strip()[:30]
            viewer.last_seen_at = now

        if body.state == "waiting" and not viewer.joined_waiting:
            viewer.joined_waiting = True
        viewer.lead_score = _compute_score(viewer)
        await db.commit()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        await db.rollback()
        return {"ok": False, "tracking_disabled": True}
    return {"ok": True}


@router.post("/premiere/heartbeat")
async def premiere_heartbeat(
    body: PremiereHeartbeatBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Public — no auth."""
    now = datetime.now(timezone.utc)
    today = datetime.now(IST).date().isoformat()
    try:
        viewer = (await db.execute(
            select(PremiereViewer).where(
                PremiereViewer.viewer_id == body.viewer_id,
                PremiereViewer.session_date == today,
                PremiereViewer.session_hour == body.session_hour,
            )
        )).scalar_one_or_none()
        if viewer is None:
            return {"ok": False}
        if body.state == "waiting" and not viewer.joined_waiting:
            viewer.joined_waiting = True
        viewer.last_seen_at = now
        viewer.lead_score = _compute_score(viewer)
        await db.commit()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        await db.rollback()
        return {"ok": False, "tracking_disabled": True}
    return {"ok": True}


@router.post("/premiere/progress")
async def premiere_progress(
    body: PremiereProgressBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Public — no auth."""
    now = datetime.now(timezone.utc)
    today = datetime.now(IST).date().isoformat()
    try:
        viewer = (await db.execute(
            select(PremiereViewer).where(
                PremiereViewer.viewer_id == body.viewer_id,
                PremiereViewer.session_date == today,
                PremiereViewer.session_hour == body.session_hour,
            )
        )).scalar_one_or_none()
        if viewer is None:
            return {"ok": False}
        viewer.current_time_sec = max(viewer.current_time_sec, body.current_time_sec)
        viewer.percentage_watched = max(viewer.percentage_watched, min(1.0, body.percentage_watched))
        if body.watch_completed:
            viewer.watch_completed = True
        viewer.last_seen_at = now
        viewer.lead_score = _compute_score(viewer)
        await db.commit()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        await db.rollback()
        return {"ok": False, "tracking_disabled": True}
    return {"ok": True}


async def _build_phone_to_owner_map(db: AsyncSession, raw_phones: list[str]) -> dict[str, str]:
    """Return {10-digit-phone: owner_name} for viewers whose phone matches a lead."""
    norm_to_raw: dict[str, str] = {}
    for p in raw_phones:
        n = normalize_phone_for_match(p)
        if n:
            norm_to_raw[n] = p

    if not norm_to_raw:
        return {}

    # Fetch all leads that have a non-null phone + their owner name
    q = (
        select(Lead.phone, User.name)
        .join(User, User.id == Lead.owner_user_id, isouter=True)
        .where(Lead.phone.isnot(None))
    )
    lead_rows = (await db.execute(q)).all()

    result: dict[str, str] = {}
    for lead_phone, owner_name in lead_rows:
        n = normalize_phone_for_match(lead_phone)
        if n and n in norm_to_raw and owner_name:
            result[norm_to_raw[n]] = owner_name
    return result


@router.get("/premiere/viewers", response_model=list[PremiereViewerOut])
async def premiere_viewers(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    hour: Optional[int] = Query(default=None, description="Filter by session hour (omit for all today)"),
    date: Optional[str] = Query(default=None, description="Session date YYYY-MM-DD (omit for today)"),
) -> list[PremiereViewerOut]:
    """Admin/leader only. Supports date param for historical view."""
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")
    target_date = date or datetime.now(IST).date().isoformat()
    q = select(PremiereViewer).where(PremiereViewer.session_date == target_date)
    if hour is not None:
        q = q.where(PremiereViewer.session_hour == hour)
    try:
        rows = (await db.execute(
            q.order_by(PremiereViewer.lead_score.desc(), PremiereViewer.last_seen_at.desc())
        )).scalars().all()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_premiere_viewers_table_error(exc):
            raise
        return []

    phone_to_owner = await _build_phone_to_owner_map(db, [v.phone for v in rows])

    return [
        PremiereViewerOut(
            viewer_id=v.viewer_id,
            name=v.name,
            masked_phone=_mask_phone(v.phone),
            city=v.city,
            session_date=v.session_date,
            session_hour=v.session_hour,
            percentage_watched=round(v.percentage_watched * 100, 1),
            current_time_sec=v.current_time_sec,
            first_seen_at=v.first_seen_at.isoformat() if v.first_seen_at else None,
            last_seen_at=v.last_seen_at.isoformat() if v.last_seen_at else None,
            lead_score=v.lead_score,
            watch_completed=v.watch_completed,
            rejoined=v.rejoined,
            referred_by_name=phone_to_owner.get(v.phone),
        )
        for v in rows
    ]
