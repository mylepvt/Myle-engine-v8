from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.time_ist import today_ist
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from main import app

from conftest import get_test_session_factory
from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


async def _reset_live_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(FollowUp))
        await session.execute(delete(CallEvent))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
        await session.commit()


async def _seed_team_gate_data() -> None:
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
            phone="9000000001",
            created_at=now - timedelta(hours=2),
        )
        imported = Lead(
            name="Imported lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9000000002",
            created_at=now - timedelta(hours=3),
        )
        claimed = Lead(
            name="Claimed lead",
            status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="9000000003",
            created_at=datetime.combine(yesterday, datetime.min.time(), tzinfo=timezone.utc),
            in_pool=False,
        )
        session.add_all([plus, imported, claimed])
        await session.flush()
        session.add_all(
            [
                ActivityLog(
                    user_id=3,
                    action="lead.created",
                    entity_type="lead",
                    entity_id=imported.id,
                    meta={"via": "file_import"},
                    created_at=now - timedelta(hours=3),
                ),
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
                    outcome="no_answer",
                    called_at=now - timedelta(minutes=25),
                ),
                CallEvent(
                    lead_id=imported.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=20),
                ),
                CallEvent(
                    lead_id=claimed.id,
                    user_id=3,
                    outcome="answered",
                    called_at=now - timedelta(minutes=10),
                ),
                FollowUp(
                    lead_id=plus.id,
                    note="Overdue call",
                    due_at=now - timedelta(hours=1),
                    created_by_user_id=3,
                ),
            ]
        )
        await session.commit()


def test_gate_assistant_requires_auth() -> None:
    assert client.get("/api/v1/gate-assistant").status_code == 401


def test_gate_assistant_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/gate-assistant")
    assert r.status_code == 200
    body = r.json()
    assert body["risk_level"] in ("green", "yellow", "red")
    assert body["progress_total"] >= 1
    assert isinstance(body["checklist"], list)
    assert "next_action" in body
    assert body["open_follow_ups"] >= 0


def test_gate_assistant_team_uses_fresh_claim_create_import_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_live_tables())
    try:
        asyncio.run(_seed_team_gate_data())
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        r = c.get("/api/v1/gate-assistant")
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "team"
        assert len(body["checklist"]) == 2
        assert [item["id"] for item in body["checklist"]] == [
            "daily_call_target",
            "followups_overdue",
        ]
        assert body["fresh_leads_today"] == 3
        assert body["calls_today"] == 3
        assert body["call_target"] == 15
        assert body["overdue_follow_ups"] == 1
        assert body["next_href"] == "work/follow-ups"
    finally:
        asyncio.run(_reset_live_tables())
