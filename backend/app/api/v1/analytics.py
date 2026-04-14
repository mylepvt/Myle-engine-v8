"""Analytics — activity from live leads; funnel report by status."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status
import csv
import io
from datetime import datetime

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.system_surface import SystemStubResponse
from app.schemas.analytics import (
    TeamPerformanceResponse,
    IndividualPerformanceResponse,
    LeaderboardResponse,
    SystemOverviewResponse,
    DailyTrendsResponse,
)
from app.services.shell_insights import (
    build_activity_log_snapshot,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


def _build_analytics_export_rows(
    *,
    days: int,
    individual_perf: dict[str, Any] | None,
    team_perf: dict[str, Any] | None,
    leaderboard: list[dict[str, Any]] | None,
) -> list[list[Any]]:
    """Same tabular content for CSV and Excel exports."""
    rows: list[list[Any]] = []
    rows.append(["Analytics Export", f"Last {days} days"])
    rows.append(["Exported at", str(datetime.now())])
    rows.append([])
    rows.append(["Individual Performance"])
    rows.append(["Metric", "Value"])
    if individual_perf:
        rep = individual_perf.get("reports") or {}
        sc = individual_perf.get("scores") or {}
        rows.append(["Total Reports", rep.get("total_reports", 0)])
        rows.append(["Total Calls", rep.get("total_calls", 0)])
        rows.append(["Total Enrollments", rep.get("total_enrollments", 0)])
        rows.append(["Total Points", sc.get("total_points", 0)])
    rows.append([])
    if team_perf:
        rows.append(["Team Performance"])
        rows.append(["Team Member", "Reports", "Calls", "Enrollments", "Points"])
        for member in team_perf.get("team_members", []):
            rows.append(
                [
                    member.get("name", ""),
                    member.get("reports", 0),
                    member.get("calls", 0),
                    member.get("enrollments", 0),
                    member.get("points", 0),
                ]
            )
        rows.append([])
    if leaderboard:
        rows.append(["Leaderboard"])
        rows.append(["Rank", "Name", "Points", "Reports"])
        for i, entry in enumerate(leaderboard[:10], 1):
            rows.append(
                [
                    i,
                    entry.get("name", ""),
                    entry.get("points", 0),
                    entry.get("reports", 0),
                ]
            )
    return rows


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/activity-log", response_model=SystemStubResponse)
async def analytics_activity_log(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Admin — recent lead creations (scoped); replace with audit store when added."""
    _require_admin(user)
    return await build_activity_log_snapshot(session, user)


@router.get("/team-performance", response_model=TeamPerformanceResponse)
async def get_team_performance(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=365),
) -> TeamPerformanceResponse:
    """Get team performance summary (leader/admin only)."""
    if user.role not in ["leader", "admin"]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only leader and admin can view team performance",
        )
    
    service = AnalyticsService(session)
    try:
        performance = await service.get_team_performance_summary(user.user_id, days)
        return TeamPerformanceResponse(**performance)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get team performance: {str(e)}",
        )


@router.get("/individual-performance", response_model=IndividualPerformanceResponse)
async def get_individual_performance(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    target_user_id: int = Query(default=None, ge=1, description="Target user ID (admin/leader only)"),
    days: int = Query(default=30, ge=1, le=365),
) -> IndividualPerformanceResponse:
    """Get individual performance metrics."""
    # Check permissions
    target_id = target_user_id or user.user_id
    if target_user_id and target_user_id != user.user_id:
        if user.role not in ["leader", "admin"]:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only leader and admin can view others' performance",
            )
    
    service = AnalyticsService(session)
    try:
        performance = await service.get_individual_performance(target_id, days)
        return IndividualPerformanceResponse(**performance)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get individual performance: {str(e)}",
        )


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=365),
) -> LeaderboardResponse:
    """Get performance leaderboard."""
    service = AnalyticsService(session)
    try:
        leaderboard = await service.get_leaderboard(days)
        return LeaderboardResponse(leaderboard=leaderboard, period=f"{days} days")
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get leaderboard: {str(e)}",
        )


@router.get("/system-overview", response_model=SystemOverviewResponse)
async def get_system_overview(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=365),
) -> SystemOverviewResponse:
    """Get system-wide analytics overview (admin only)."""
    _require_admin(user)
    
    service = AnalyticsService(session)
    try:
        overview = await service.get_system_overview(days)
        return SystemOverviewResponse(**overview)
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system overview: {str(e)}",
        )


@router.get("/daily-trends", response_model=DailyTrendsResponse)
async def get_daily_trends(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    target_user_id: int = Query(default=None, ge=1, description="Target user ID for individual trends"),
    days: int = Query(default=30, ge=1, le=90),
) -> DailyTrendsResponse:
    """Get daily report trends."""
    # Check permissions for user-specific trends
    if target_user_id and target_user_id != user.user_id:
        if user.role not in ["leader", "admin"]:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only leader and admin can view others' trends",
            )
    
    target_id = target_user_id or (None if user.role in ["leader", "admin"] else user.user_id)
    
    service = AnalyticsService(session)
    try:
        trends = await service.get_daily_report_trends(target_id, days)
        return DailyTrendsResponse(trends=trends, period=f"{days} days")
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get daily trends: {str(e)}",
        )


@router.post("/export")
async def export_analytics(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    format: str = Query(default="csv", pattern="^(csv|excel)$"),
    days: int = Query(default=30, ge=1, le=365),
) -> Response:
    """Export analytics data in CSV or Excel (.xlsx) format."""
    service = AnalyticsService(session)

    try:
        individual_perf = await service.get_individual_performance(user.user_id, days)
        team_perf = None
        leaderboard = None

        if user.role in ["leader", "admin"]:
            team_perf = await service.get_team_performance_summary(user.user_id, days)
            leaderboard = await service.get_leaderboard(days)

        rows = _build_analytics_export_rows(
            days=days,
            individual_perf=individual_perf,
            team_perf=team_perf,
            leaderboard=leaderboard,
        )

        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            for row in rows:
                writer.writerow(row)
            csv_content = output.getvalue()
            output.close()
            return Response(
                content=csv_content,
                media_type="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": f'attachment; filename="analytics-{days}days.csv"'
                },
            )

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Analytics"
        for row in rows:
            ws.append(list(row))
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            headers={
                "Content-Disposition": f'attachment; filename="analytics-{days}days.xlsx"'
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export failed: {str(e)}",
        )
