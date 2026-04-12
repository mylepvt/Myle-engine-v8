"""Daily reports — upsert per user per day + scoring (+20 pts legacy)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.schemas.reports import DailyReportPublic, DailyReportSubmit

router = APIRouter()

_REPORT_POINTS = 20


def _require_team_or_leader(user: AuthUser) -> None:
    if user.role not in ("team", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/daily", response_model=DailyReportPublic, status_code=http_status.HTTP_201_CREATED)
async def submit_daily_report(
    body: DailyReportSubmit,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DailyReportPublic:
    """Upsert daily report for ``report_date``; award points once per calendar day (resubmit updates fields only)."""
    _require_team_or_leader(user)

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

    await session.commit()
    await session.refresh(row)
    return DailyReportPublic(
        id=row.id,
        user_id=row.user_id,
        report_date=row.report_date,
        total_calling=row.total_calling,
        remarks=row.remarks,
        submitted_at=row.submitted_at,
        system_verified=row.system_verified,
        points_awarded=points_awarded,
    )
