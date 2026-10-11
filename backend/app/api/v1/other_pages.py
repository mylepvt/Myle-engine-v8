"""Other nav: leaderboard, notices, live session, training, daily report."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.announcement import Announcement
from app.models.announcement_reaction import AnnouncementReaction
from app.models.app_setting import AppSetting
from app.models.daily_report import DailyReport
from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.schemas.notice_board import AnnouncementCreate, AnnouncementOut, NoticeBoardResponse, ReactionSummary, ReactionToggle
from app.schemas.system_surface import SystemStubResponse, TrainingSurfaceResponse
from app.services.team_reports_metrics import IST
from app.services.training_surface import build_training_surface
from app.services.training_uploads import save_training_notes_image

router = APIRouter()

_CONTENT_LINK_KEYS = [
    "content.esbi_model",
    "content.power_of_network",
    "content.manik_expose",
    "content.blueprint_video",
]


class ContentLinksResponse(BaseModel):
    links: dict[str, str]


@router.get("/content-links", response_model=ContentLinksResponse)
async def get_content_links(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ContentLinksResponse:
    rows = (
        await session.execute(
            select(AppSetting.key, AppSetting.value).where(
                AppSetting.key.in_(_CONTENT_LINK_KEYS)
            )
        )
    ).all()
    links = {key: (value or "") for key, value in rows}
    return ContentLinksResponse(links=links)


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


async def _attach_reactions(
    items: list[AnnouncementOut],
    session: AsyncSession,
    user_id: int,
) -> None:
    if not items:
        return
    ids = [r.id for r in items]
    rows = (
        await session.execute(
            select(
                AnnouncementReaction.announcement_id,
                AnnouncementReaction.emoji,
                AnnouncementReaction.user_id,
            ).where(AnnouncementReaction.announcement_id.in_(ids))
        )
    ).all()
    grouped: dict[int, dict[str, dict]] = {}
    for announcement_id, emoji, uid in rows:
        g = grouped.setdefault(announcement_id, {})
        e = g.setdefault(emoji, {"count": 0, "reacted_by_me": False})
        e["count"] += 1
        if uid == user_id:
            e["reacted_by_me"] = True
    for item in items:
        raw = grouped.get(item.id, {})
        item.reactions = [
            ReactionSummary(emoji=emoji, **data) for emoji, data in raw.items()
        ]


@router.get("/leaderboard", response_model=SystemStubResponse)
async def other_leaderboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Leaderboard: top 20 members by MYLE Points earned this month, with their level."""
    from app.services import process_rewards as pr

    board = await pr.period_leaderboard(session, period="month", viewer_user_id=user.user_id, limit=20)
    totals = await pr.lifetime_points(session, [r["user_id"] for r in board["items"]])
    items = [
        {
            "title": f"#{r['rank']} {r['name']}",
            # "<role> · <shown under the name> · mp: N · level: key" — parsed by the leaderboard page.
            "detail": f"{r['role']} · {r['mp']} MP this month · mp: {r['mp']} · "
            f"level: {pr.level_for(totals.get(r['user_id'], 0))['key']}",
            "count": r["rank"],
        }
        for r in board["items"]
    ]
    return SystemStubResponse(items=items, total=len(items), note="Top 20 by MYLE Points this month.")


@router.get("/notice-board", response_model=NoticeBoardResponse)
async def other_notice_board_list(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
) -> NoticeBoardResponse:
    """All logged-in roles — pinned first, then newest (legacy ``/announcements``)."""
    total_q = await session.execute(select(func.count()).select_from(Announcement))
    total = int(total_q.scalar_one())
    stmt = (
        select(Announcement)
        .order_by(Announcement.pin.desc(), Announcement.created_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    items = [AnnouncementOut.model_validate(r) for r in rows]
    await _attach_reactions(items, session, user.user_id)
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
    item = AnnouncementOut.model_validate(row)
    await _attach_reactions([item], session, user.user_id)
    return item


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
    item = AnnouncementOut.model_validate(row)
    await _attach_reactions([item], session, user.user_id)
    return item


@router.post(
    "/notice-board/{announcement_id}/react",
    response_model=AnnouncementOut,
)
async def other_notice_board_react(
    announcement_id: int,
    body: ReactionToggle,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementOut:
    """Toggle an emoji reaction on an announcement (any logged-in role)."""
    row = await session.get(Announcement, announcement_id)
    if row is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")

    existing = (
        await session.execute(
            select(AnnouncementReaction).where(
                AnnouncementReaction.announcement_id == announcement_id,
                AnnouncementReaction.user_id == user.user_id,
                AnnouncementReaction.emoji == body.emoji,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        await session.delete(existing)
    else:
        session.add(
            AnnouncementReaction(
                announcement_id=announcement_id,
                user_id=user.user_id,
                emoji=body.emoji,
            )
        )
    await session.commit()

    item = AnnouncementOut.model_validate(row)
    await _attach_reactions([item], session, user.user_id)
    return item


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
                "updated_at": (await _get("live_session_updated_at")) or None,
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
        image_path = await save_training_notes_image(session, user.user_id, day_number, file)
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
