"""Team reports (leader/admin scoped metrics + member rows)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.constants.roles import DEV_FBO_BY_ROLE
from app.core.time_ist import today_ist
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User
from main import app

from conftest import get_test_session_factory
from util_jwt_patch import patch_jwt_settings


def _client(monkeypatch: pytest.MonkeyPatch, role: str) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return c


async def _reset_report_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(DailyReport))
        await session.execute(delete(CallEvent))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
        leader = await session.get(User, 2)
        team = await session.get(User, 3)
        if leader is not None:
            leader.name = None
        if team is not None:
            team.name = None
        await session.commit()


async def _seed_report_tables() -> str:
    factory = get_test_session_factory()
    now = datetime.now(timezone.utc)
    today = today_ist()
    yesterday = today - timedelta(days=1)
    async with factory() as session:
        plus = Lead(
            name="Plus lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9444444444",
            created_at=now - timedelta(hours=2),
        )
        imported = Lead(
            name="Imported lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9555555555",
            created_at=now - timedelta(hours=3),
        )
        claimed = Lead(
            name="Claimed lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9666666666",
            created_at=datetime.combine(yesterday, datetime.min.time(), tzinfo=timezone.utc),
        )
        session.add_all([plus, imported, claimed])
        await session.flush()
        session.add(
            ActivityLog(
                user_id=3,
                action="lead.claimed",
                entity_type="lead",
                entity_id=claimed.id,
                created_at=now - timedelta(minutes=45),
            )
        )
        session.add_all(
            [
                CallEvent(
                    lead_id=plus.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=30),
                ),
                CallEvent(
                    lead_id=plus.id,
                    user_id=3,
                    outcome="busy",
                    called_at=now - timedelta(minutes=25),
                ),
                CallEvent(
                    lead_id=imported.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=15),
                ),
                CallEvent(
                    lead_id=claimed.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=5),
                ),
            ]
        )
        await session.commit()
    return today.isoformat()


async def _seed_daily_report_rows() -> str:
    factory = get_test_session_factory()
    today = today_ist()
    now = datetime.now(timezone.utc)
    async with factory() as session:
        team = await session.get(User, 3)
        assert team is not None
        team.name = "Night Agent"
        session.add_all(
            [
                DailyReport(
                    user_id=2,
                    report_date=today,
                    total_calling=19,
                    calls_picked=7,
                    wrong_numbers=1,
                    enrollments_done=2,
                    pending_enroll=1,
                    underage=0,
                    plan_2cc=3,
                    seat_holdings=1,
                    leads_educated=6,
                    pdf_covered=9,
                    videos_sent_actual=8,
                    calls_made_actual=18,
                    payments_actual=2,
                    remarks="Leader self report",
                    submitted_at=now - timedelta(minutes=50),
                    system_verified=True,
                ),
                DailyReport(
                    user_id=3,
                    report_date=today,
                    total_calling=14,
                    calls_picked=5,
                    wrong_numbers=2,
                    enrollments_done=1,
                    pending_enroll=2,
                    underage=1,
                    plan_2cc=2,
                    seat_holdings=0,
                    leads_educated=4,
                    pdf_covered=7,
                    videos_sent_actual=6,
                    calls_made_actual=13,
                    payments_actual=1,
                    remarks="Night shift finished",
                    submitted_at=now - timedelta(minutes=15),
                    system_verified=True,
                ),
            ]
        )
        await session.commit()
    return today.isoformat()


async def _seed_scoped_live_report_tables() -> str:
    factory = get_test_session_factory()
    now = datetime.now(timezone.utc)
    today = today_ist()
    yesterday = today - timedelta(days=1)
    async with factory() as session:
        leader_team = Lead(
            name="Leader-owned lead",
            status="day1",
            created_by_user_id=2,
            assigned_to_user_id=2,
            phone="9000000001",
            created_at=now - timedelta(hours=2),
            payment_proof_uploaded_at=now - timedelta(minutes=20),
        )
        team_plus = Lead(
            name="Team fresh lead",
            status="day2",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9000000002",
            created_at=now - timedelta(hours=3),
            payment_proof_uploaded_at=now - timedelta(minutes=12),
        )
        team_claimed = Lead(
            name="Team claimed lead",
            status="converted",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9000000003",
            created_at=datetime.combine(yesterday, datetime.min.time(), tzinfo=timezone.utc),
        )
        session.add_all([leader_team, team_plus, team_claimed])
        await session.flush()
        session.add_all(
            [
                ActivityLog(
                    user_id=2,
                    action="lead.claimed",
                    entity_type="lead",
                    entity_id=leader_team.id,
                    created_at=now - timedelta(minutes=55),
                ),
                ActivityLog(
                    user_id=3,
                    action="lead.claimed",
                    entity_type="lead",
                    entity_id=team_claimed.id,
                    created_at=now - timedelta(minutes=45),
                ),
                ActivityLog(
                    user_id=1,
                    action="payment_proof_approved",
                    entity_type="lead",
                    entity_id=leader_team.id,
                    created_at=now - timedelta(minutes=10),
                ),
                ActivityLog(
                    user_id=1,
                    action="payment_proof_approved",
                    entity_type="lead",
                    entity_id=team_plus.id,
                    created_at=now - timedelta(minutes=8),
                ),
                CallEvent(
                    lead_id=leader_team.id,
                    user_id=2,
                    outcome="answered",
                    called_at=now - timedelta(minutes=35),
                ),
                CallEvent(
                    lead_id=team_plus.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=25),
                ),
                CallEvent(
                    lead_id=team_claimed.id,
                    user_id=3,
                    outcome="busy",
                    called_at=now - timedelta(minutes=5),
                ),
            ]
        )
        await session.commit()
    return today.isoformat()


def test_team_reports_requires_admin_or_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "team")
    assert c.get("/api/v1/team/reports").status_code == 403


def test_team_reports_invalid_date(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "admin")
    r = c.get("/api/v1/team/reports?date=not-a-date")
    assert r.status_code == 422


def test_team_reports_admin_json_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "admin")
    r = c.get("/api/v1/team/reports?date=2026-01-15")
    assert r.status_code == 200
    b = r.json()
    assert b["date"] == "2026-01-15"
    assert b["timezone"] == "Asia/Kolkata"
    assert "items" in b
    assert "missing_members" in b
    assert b["scope_total_members"] == 2
    ls = b["live_summary"]
    for k in (
        "leads_claimed_today",
        "calls_made_today",
        "enrolled_today",
        "payment_proofs_approved_today",
        "day1_total",
        "day2_total",
        "converted_total",
    ):
        assert k in ls


def test_team_reports_leader_gets_only_downline_member_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_report_tables())
    try:
        report_date = asyncio.run(_seed_daily_report_rows())
        c = _client(monkeypatch, "leader")
        r = c.get(f"/api/v1/team/reports?date={report_date}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["scope_total_members"] == 1
        assert body["total"] == 1
        assert body["missing_members"] == []
        row = body["items"][0]
        assert row["user_id"] == 3
        assert row["member_name"] == "Night Agent"
        assert row["member_fbo_id"] == DEV_FBO_BY_ROLE["team"]
        assert row["member_role"] == "team"
        assert row["remarks"] == "Night shift finished"
    finally:
        asyncio.run(_reset_report_tables())


def test_team_reports_admin_gets_all_submitted_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_report_tables())
    try:
        report_date = asyncio.run(_seed_daily_report_rows())
        c = _client(monkeypatch, "admin")
        r = c.get(f"/api/v1/team/reports?date={report_date}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["scope_total_members"] == 2
        assert body["total"] == 2
        assert {row["user_id"] for row in body["items"]} == {2, 3}
    finally:
        asyncio.run(_reset_report_tables())


def test_team_reports_use_distinct_fresh_call_count(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_report_tables())
    try:
        report_date = asyncio.run(_seed_report_tables())
        c = _client(monkeypatch, "admin")
        r = c.get(f"/api/v1/team/reports?date={report_date}")
        assert r.status_code == 200
        live = r.json()["live_summary"]
        assert live["leads_claimed_today"] == 1
        assert live["calls_made_today"] == 3
    finally:
        asyncio.run(_reset_report_tables())


def test_team_reports_leader_live_summary_is_scoped_to_downline(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_report_tables())
    try:
        report_date = asyncio.run(_seed_scoped_live_report_tables())
        c = _client(monkeypatch, "leader")
        r = c.get(f"/api/v1/team/reports?date={report_date}")
        assert r.status_code == 200, r.text
        live = r.json()["live_summary"]
        assert live["leads_claimed_today"] == 1
        assert live["calls_made_today"] == 2
        assert live["enrolled_today"] == 1
        assert live["payment_proofs_approved_today"] == 1
        assert live["day1_total"] == 0
        assert live["day2_total"] == 1
        assert live["converted_total"] == 1
    finally:
        asyncio.run(_reset_report_tables())
