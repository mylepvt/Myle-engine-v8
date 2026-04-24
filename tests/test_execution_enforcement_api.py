"""Smoke tests for execution enforcement routes (vl2 service port)."""

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


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


async def _reset_execution_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(CallEvent))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
        await session.commit()


async def _seed_team_execution_data() -> None:
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
            phone="9111111111",
            created_at=now - timedelta(hours=2),
        )
        imported = Lead(
            name="Imported lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9222222222",
            created_at=now - timedelta(hours=3),
        )
        claimed = Lead(
            name="Claimed lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9333333333",
            created_at=datetime.combine(yesterday, datetime.min.time(), tzinfo=timezone.utc),
        )
        session.add_all([plus, imported, claimed])
        await session.flush()
        session.add_all(
            [
                ActivityLog(
                    user_id=3,
                    action="lead.claimed",
                    entity_type="lead",
                    entity_id=claimed.id,
                    created_at=now - timedelta(minutes=45),
                ),
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


def test_team_funnel_requires_team_role(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/execution/personal-funnel").status_code == 403


def test_team_funnel_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/execution/personal-funnel")
    assert r.status_code == 200
    body = r.json()
    assert "claimed" in body
    assert body["claimed"] == 0


def test_team_today_stats_requires_team_role(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/execution/team-today-stats").status_code == 403


def test_team_today_stats_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/execution/team-today-stats")
    assert r.status_code == 200
    body = r.json()
    assert "claimed_today" in body
    assert "calls_today" in body
    assert "enrolled_today" in body


def test_team_today_stats_count_distinct_fresh_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_execution_tables())
    try:
        asyncio.run(_seed_team_execution_data())
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        r = c.get("/api/v1/execution/team-today-stats")
        assert r.status_code == 200
        body = r.json()
        assert body["claimed_today"] == 3
        assert body["fresh_leads_today"] == 3
        assert body["calls_today"] == 3
        assert body["call_target"] == 15
    finally:
        asyncio.run(_reset_execution_tables())


def test_leader_downline_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/execution/downline-stats")
    assert r.status_code == 200
    data = r.json()
    assert "stats" in data
    assert "bottleneck_tags" in data


def test_leader_downline_uses_real_call_counts_for_gate_tags(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_execution_tables())
    try:
        asyncio.run(_seed_team_execution_data())
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        r = c.get("/api/v1/execution/downline-stats")
        assert r.status_code == 200
        data = r.json()
        member = data["stats"]["3"]
        assert member["calls_today"] == 3
        assert member["fresh_leads_today"] == 3
        assert member["call_target"] == 15
        assert member["call_gate_met"] is False
        assert "Call gate short" in data["bottleneck_tags"]["3"]
        assert "No activity" not in data["bottleneck_tags"]["3"]
    finally:
        asyncio.run(_reset_execution_tables())


def test_admin_surfaces(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/execution/at-risk-leads").status_code == 200
    assert c.get("/api/v1/execution/weak-members").status_code == 200
    assert c.get("/api/v1/execution/leak-map").status_code == 200
    stale = c.post("/api/v1/execution/stale-redistribute")
    assert stale.status_code == 200
    assert isinstance(stale.json().get("implemented"), bool)


def test_team_cannot_admin_leak_map(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/execution/leak-map").status_code == 403
