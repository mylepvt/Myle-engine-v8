"""Daily reports — upsert per user per day + scoring (+20 pts legacy)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.schemas.reports import DailyReportPublic, DailyReportSubmit

router = APIRouter()

_REPORT_POINTS = 20


def _require_report_actor(user: AuthUser) -> None:
    """Team/leader submit daily reports; admin allowed so dashboard works when signed in as admin (incl. nav preview)."""
    if user.role not in ("team", "leader", "admin"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Daily report is only for team, leader, or admin accounts.",
        )


def _report_to_public(row: DailyReport, *, points_awarded: int = 0) -> DailyReportPublic:
    return DailyReportPublic(
        id=row.id,
        user_id=row.user_id,
        report_date=row.report_date,
        total_calling=row.total_calling,
        remarks=row.remarks,
        submitted_at=row.submitted_at,
        system_verified=row.system_verified,
        points_awarded=points_awarded,
        calls_picked=row.calls_picked,
        wrong_numbers=row.wrong_numbers,
        enrollments_done=row.enrollments_done,
        pending_enroll=row.pending_enroll,
        underage=row.underage,
        plan_2cc=row.plan_2cc,
        seat_holdings=row.seat_holdings,
        leads_educated=row.leads_educated,
        pdf_covered=row.pdf_covered,
        videos_sent_actual=row.videos_sent_actual,
        calls_made_actual=row.calls_made_actual,
        payments_actual=row.payments_actual,
    )


@router.get("/daily/mine", response_model=Optional[DailyReportPublic])
async def get_my_daily_report(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    report_date: date = Query(..., description="Calendar day YYYY-MM-DD"),
) -> Optional[DailyReportPublic]:
    """Load a single saved report for the caller (team/leader)."""
    _require_report_actor(user)
    r = await session.execute(
        select(DailyReport).where(
            DailyReport.user_id == user.user_id,
            DailyReport.report_date == report_date,
        )
    )
    row = r.scalar_one_or_none()
    if row is None:
        return None
    return _report_to_public(row, points_awarded=0)


@router.post("/daily", response_model=DailyReportPublic, status_code=http_status.HTTP_201_CREATED)
async def submit_daily_report(
    body: DailyReportSubmit,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DailyReportPublic:
    """Upsert daily report for ``report_date``; award points once per calendar day (resubmit updates fields only)."""
    _require_report_actor(user)

    r = await session.execute(
        select(DailyReport).where(
            DailyReport.user_id == user.user_id,
            DailyReport.report_date == body.report_date,
        )
    )
    row = r.scalar_one_or_none()
    points_awarded = 0
    now = datetime.now(timezone.utc)
    if row is None:
        row = DailyReport(
            user_id=user.user_id,
            report_date=body.report_date,
            total_calling=body.total_calling,
            remarks=body.remarks,
            submitted_at=now,
            system_verified=False,
            calls_picked=body.calls_picked,
            wrong_numbers=body.wrong_numbers,
            enrollments_done=body.enrollments_done,
            pending_enroll=body.pending_enroll,
            underage=body.underage,
            plan_2cc=body.plan_2cc,
            seat_holdings=body.seat_holdings,
            leads_educated=body.leads_educated,
            pdf_covered=body.pdf_covered,
            videos_sent_actual=body.videos_sent_actual,
            calls_made_actual=body.calls_made_actual,
            payments_actual=body.payments_actual,
        )
        session.add(row)
        await session.flush()

        sr = await session.execute(
            select(DailyScore).where(
                DailyScore.user_id == user.user_id,
                DailyScore.score_date == body.report_date,
            )
        )
        score = sr.scalar_one_or_none()
        if score is None:
            session.add(
                DailyScore(
                    user_id=user.user_id,
                    score_date=body.report_date,
                    points=_REPORT_POINTS,
                )
            )
            points_awarded = _REPORT_POINTS
        else:
            score.points = int(score.points or 0) + _REPORT_POINTS
            points_awarded = _REPORT_POINTS
    else:
        row.total_calling = body.total_calling
        row.remarks = body.remarks
        row.submitted_at = now
        row.calls_picked = body.calls_picked
        row.wrong_numbers = body.wrong_numbers
        row.enrollments_done = body.enrollments_done
        row.pending_enroll = body.pending_enroll
        row.underage = body.underage
        row.plan_2cc = body.plan_2cc
        row.seat_holdings = body.seat_holdings
        row.leads_educated = body.leads_educated
        row.pdf_covered = body.pdf_covered
        row.videos_sent_actual = body.videos_sent_actual
        row.calls_made_actual = body.calls_made_actual
        row.payments_actual = body.payments_actual

    await session.commit()
    await session.refresh(row)
    return _report_to_public(row, points_awarded=points_awarded)
