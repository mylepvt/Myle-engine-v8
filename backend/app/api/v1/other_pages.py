"""Other nav: leaderboard, notices, live session, training, daily report."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.announcement import Announcement
from app.models.app_setting import AppSetting
from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.models.user import User
from app.schemas.notice_board import AnnouncementCreate, AnnouncementOut, NoticeBoardResponse
from app.schemas.system_surface import SystemStubResponse, TrainingSurfaceResponse
from app.services.team_reports_metrics import IST
from app.services.training_surface import build_training_surface

router = APIRouter()


def _require_leader_or_team(user: AuthUser) -> None:
    if user.role not in ("leader", "team"):
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
    _ = user
    stmt = (
        select(
            User.id,
            User.fbo_id,
            User.username,
            User.email,
            User.role,
            func.coalesce(func.sum(DailyScore.points), 0).label("pts"),
        )
        .select_from(User)
        .outerjoin(DailyScore, DailyScore.user_id == User.id)
        .group_by(User.id, User.fbo_id, User.username, User.email, User.role)
        .order_by(desc("pts"))
        .limit(50)
    )
    rows = (await session.execute(stmt)).all()
    items: list[dict] = []
    for rank, r in enumerate(rows, start=1):
        _uid, fbo, uname, email, role, pts = r
        label = (uname or "").strip() or (email.split("@", 1)[0] if email else "") or fbo
        items.append(
            {
                "title": f"#{rank} {label}",
                "detail": f"{role} · {email} · total points: {int(pts)}",
                "count": rank,
            }
        )
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Rankings use summed `daily_scores.points` across all submitted report days.",
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
    _ = user

    async def _get(key: str) -> str | None:
        row = await session.get(AppSetting, key)
        return row.value if row and row.value else None

    title = (await _get("live_session_title")) or "Live session"
    url = (await _get("live_session_url")) or ""
    sched = (
        (await _get("live_session_schedule"))
        or "Set `live_session_title`, `live_session_url`, and `live_session_schedule` in admin → General (app_settings) to publish meeting links here."
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
        note="Meeting link and copy are driven from `app_settings` keys.",
    )


@router.get("/training", response_model=TrainingSurfaceResponse)
async def other_training(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingSurfaceResponse:
    _require_leader_or_team(user)
    return await build_training_surface(session, user.user_id)


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
