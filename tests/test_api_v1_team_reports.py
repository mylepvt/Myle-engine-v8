"""Team reports (admin metrics)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.time_ist import today_ist
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead
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
        await session.execute(delete(CallEvent))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
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


def test_team_reports_requires_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "leader")
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
