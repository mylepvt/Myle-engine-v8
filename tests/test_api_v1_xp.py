from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.models.crm_outbox import CrmOutbox
from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.models.xp_monthly_archive import XpMonthlyArchive
from app.services.team_reports_metrics import IST
from app.services.xp_service import grant_xp
from main import app

from util_jwt_patch import patch_jwt_settings


async def _reset_xp_state() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(XpEvent))
        await session.execute(delete(XpMonthlyArchive))
        await session.execute(delete(DailyScore))
        await session.execute(delete(DailyReport))
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(Lead))

        users = (await session.execute(select(User))).scalars().all()
        for user in users:
            user.xp_total = 0
            user.xp_level = "rookie"
            user.login_streak = 0
            user.last_login_date = None
            user.xp_season_year = None
            user.xp_season_month = None

        await session.commit()


async def _seed_lead(
    *,
    status: str,
    created_by_user_id: int,
    assigned_to_user_id: int | None = None,
    created_at: datetime | None = None,
    payment_status: str | None = None,
) -> int:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        lead = Lead(
            name="XP Lead",
            status=status,
            created_by_user_id=created_by_user_id,
            assigned_to_user_id=assigned_to_user_id,
            created_at=created_at or datetime.now(timezone.utc),
            payment_status=payment_status,
        )
        session.add(lead)
        await session.commit()
        await session.refresh(lead)
        return int(lead.id)


async def _read_user_xp(user_id: int) -> tuple[int, int]:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        event_count = int(
            (
                await session.execute(
                    select(func.count()).where(XpEvent.user_id == user_id),
                )
            ).scalar_one()
        )
        return int(user.xp_total or 0), event_count


async def _lead_won_event_count(lead_id: int) -> int:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        return int(
            (
                await session.execute(
                    select(func.count()).where(
                        XpEvent.action == "lead_won",
                        XpEvent.lead_id == lead_id,
                    ),
                )
            ).scalar_one()
        )


def _client(monkeypatch: pytest.MonkeyPatch, role: str) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return c


def test_ping_login_awards_only_once_per_day(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_xp_state())
    try:
        c = _client(monkeypatch, "team")

        first = c.post("/api/v1/xp/ping-login")
        assert first.status_code == 200
        assert first.json()["xp_granted"] == 5
        assert first.json()["already_claimed"] is False

        second = c.post("/api/v1/xp/ping-login")
        assert second.status_code == 200
        assert second.json()["xp_granted"] is None
        assert second.json()["already_claimed"] is True

        xp_total, event_count = asyncio.run(_read_user_xp(3))
        assert xp_total == 5
        assert event_count == 1
    finally:
        asyncio.run(_reset_xp_state())


def test_team_report_submission_is_locked_to_today(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_xp_state())
    try:
        c = _client(monkeypatch, "team")
        yesterday_ist = (datetime.now(IST).date() - timedelta(days=1)).isoformat()

        r = c.post(
            "/api/v1/reports/daily",
            json={
                "report_date": yesterday_ist,
                "total_calling": 5,
                "calls_picked": 2,
                "wrong_numbers": 0,
                "enrollments_done": 0,
                "pending_enroll": 0,
                "underage": 0,
                "plan_2cc": 0,
                "seat_holdings": 0,
                "leads_educated": 0,
                "pdf_covered": 0,
                "videos_sent_actual": 0,
                "calls_made_actual": 5,
                "payments_actual": 0,
            },
        )
        assert r.status_code == 400
        body = r.json()
        detail = body.get("detail") or body.get("error", {}).get("message")
        assert detail == "Only today's daily report can be submitted."
    finally:
        asyncio.run(_reset_xp_state())


def test_converted_xp_goes_to_assignee_and_reverts_cleanly(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_xp_state())
    lead_id = asyncio.run(
        _seed_lead(
            status="day3",
            created_by_user_id=3,
            assigned_to_user_id=3,
            created_at=datetime.now(timezone.utc) - timedelta(days=2),
            payment_status="approved",
        )
    )
    try:
        c = _client(monkeypatch, "leader")

        converted = c.post(f"/api/v1/leads/{lead_id}/transition", json={"target_status": "converted"})
        assert converted.status_code == 200

        team_xp, _ = asyncio.run(_read_user_xp(3))
        leader_xp, _ = asyncio.run(_read_user_xp(2))
        assert team_xp == 100
        assert leader_xp == 0
        assert asyncio.run(_lead_won_event_count(lead_id)) == 1

        reverted = c.post(f"/api/v1/leads/{lead_id}/transition", json={"target_status": "day3"})
        assert reverted.status_code == 200

        team_xp_after, _ = asyncio.run(_read_user_xp(3))
        leader_xp_after, _ = asyncio.run(_read_user_xp(2))
        assert team_xp_after == 0
        assert leader_xp_after == 0
        assert asyncio.run(_lead_won_event_count(lead_id)) == 0
    finally:
        asyncio.run(_reset_xp_state())


def test_lead_contacted_xp_is_one_time_per_lead(monkeypatch: pytest.MonkeyPatch) -> None:
    _ = monkeypatch
    asyncio.run(_reset_xp_state())
    lead_id = asyncio.run(
        _seed_lead(
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            created_at=datetime.now(timezone.utc) - timedelta(days=2),
        )
    )
    try:
        async def _exercise() -> tuple[int | None, int | None, int, int]:
            fac = test_conftest.get_test_session_factory()
            async with fac() as session:
                first = await grant_xp(session, 3, "lead_contacted", lead_id)
                await session.commit()
                second = await grant_xp(session, 2, "lead_contacted", lead_id)
                await session.commit()

                team = (await session.execute(select(User).where(User.id == 3))).scalar_one()
                leader = (await session.execute(select(User).where(User.id == 2))).scalar_one()
                return first, second, int(team.xp_total or 0), int(leader.xp_total or 0)

        first, second, team_xp, leader_xp = asyncio.run(_exercise())
        assert first == 10
        assert second is None
        assert team_xp == 10
        assert leader_xp == 0
    finally:
        asyncio.run(_reset_xp_state())
