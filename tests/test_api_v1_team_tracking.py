from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.core.realtime_hub import hub
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_member_stat import DailyMemberStat
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.services.team_tracking import compute_consistency_score, sweep_stale_presence
from main import app

from util_jwt_patch import patch_jwt_settings


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


async def _reset_tracking_state() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(UserPresenceSession))
        await session.execute(delete(DailyMemberStat))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(CallEvent))
        await session.execute(delete(FollowUp))
        await session.execute(delete(Lead))
        await session.execute(update(User).values(last_seen_at=None))
        await session.commit()


async def _seed_team_tracking_activity(stat_date: date) -> None:
    fac = test_conftest.get_test_session_factory()
    base = datetime(stat_date.year, stat_date.month, stat_date.day, 10, 0, tzinfo=timezone.utc)
    async with fac() as session:
        session.add(
            ActivityLog(
                user_id=3,
                action="login",
                entity_type="auth",
                created_at=base,
            )
        )
        lead = Lead(
            name="Tracked Team Lead",
            status="new_lead",
            created_by_user_id=3,
            created_at=base.replace(hour=11),
        )
        session.add(lead)
        await session.flush()
        session.add(
            CallEvent(
                lead_id=lead.id,
                user_id=3,
                outcome="answered",
                duration_seconds=180,
                called_at=base.replace(hour=12),
            )
        )
        session.add(
            FollowUp(
                lead_id=lead.id,
                note="Completed follow-up",
                created_by_user_id=2,
                completed_at=base.replace(hour=13),
                completed_by_user_id=3,
            )
        )
        await session.commit()


async def _presence_state(user_id: int) -> tuple[UserPresenceSession | None, User | None]:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        row = (
            await session.execute(
                select(UserPresenceSession)
                .where(UserPresenceSession.user_id == user_id)
                .order_by(UserPresenceSession.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        user = await session.get(User, user_id)
        return row, user


async def _sweep_presence(now: datetime) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await sweep_stale_presence(session, now=now)


def test_team_tracking_requires_auth() -> None:
    res = TestClient(app).get("/api/v1/team/tracking/overview")
    assert res.status_code == 401


def test_team_tracking_admin_overview_uses_canonical_scope_and_server_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stat_date = date(2026, 4, 23)
    asyncio.run(_reset_tracking_state())
    asyncio.run(_seed_team_tracking_activity(stat_date))
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.get("/api/v1/team/tracking/overview", params={"date": stat_date.isoformat()})
        assert res.status_code == 200
        body = res.json()

        assert body["total"] == 2
        assert body["scope_total_members"] == 2
        assert {item["member_email"] for item in body["items"]} == {
            "dev-leader@myle.local",
            "dev-team@myle.local",
        }

        team_row = next(item for item in body["items"] if item["member_email"] == "dev-team@myle.local")
        assert team_row["leader_user_id"] == 2
        assert team_row["leader_name"] == "TestLeaderDisplay"
        assert team_row["presence_status"] == "offline"
        assert team_row["login_count"] == 1
        assert team_row["calls_count"] == 1
        assert team_row["leads_added_count"] == 1
        assert team_row["followups_done_count"] == 1
        assert team_row["consistency_band"] == "low"
        assert team_row["consistency_score"] > 0
        assert body["average_score"] > 0
    finally:
        asyncio.run(_reset_tracking_state())


def test_team_tracking_team_me_is_self_and_other_member_hidden(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_tracking_state())
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200

        me = c.get("/api/v1/team/tracking/me")
        assert me.status_code == 200
        assert me.json()["member"]["member_email"] == "dev-team@myle.local"

        other = c.get("/api/v1/team/tracking/2")
        assert other.status_code == 404
    finally:
        asyncio.run(_reset_tracking_state())


def test_team_tracking_admin_me_returns_self(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_tracking_state())
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.get("/api/v1/team/tracking/me")
        assert res.status_code == 200
        assert res.json()["member"]["member_email"] == "dev-admin@myle.local"
    finally:
        asyncio.run(_reset_tracking_state())


def test_team_tracking_presence_websocket_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_tracking_state())
    hub.clear_for_tests()
    c = _client(monkeypatch)
    try:
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200

        with c.websocket_connect("/api/v1/ws") as ws:
            initial = json.loads(ws.receive_text())
            assert initial["type"] == "invalidate"
            assert "team_tracking.presence" in initial["topics"]

            row, user = asyncio.run(_presence_state(2))
            assert row is not None
            assert row.status == "online"
            assert row.disconnected_at is None
            assert user is not None
            assert user.last_seen_at is not None

            ws.send_text(json.dumps({"action": "idle", "path": "/dashboard/team/tracking"}))
            idle = json.loads(ws.receive_text())
            assert idle["type"] == "invalidate"
            assert "team_tracking.presence" in idle["topics"]

            row, _user = asyncio.run(_presence_state(2))
            assert row is not None
            assert row.status == "idle"
            assert row.last_path == "/dashboard/team/tracking"

        row, user = asyncio.run(_presence_state(2))
        assert row is not None
        if row.status != "offline":
            cutoff = row.last_heartbeat_at
            assert cutoff is not None
            if cutoff.tzinfo is None:
                cutoff = cutoff.replace(tzinfo=timezone.utc)
            asyncio.run(_sweep_presence(cutoff + timedelta(seconds=46)))
            row, user = asyncio.run(_presence_state(2))
            assert row is not None
        assert row.status == "offline"
        assert row.disconnected_at is not None
        assert user is not None
        assert user.last_seen_at is not None
    finally:
        c.close()
        hub.clear_for_tests()
        asyncio.run(_reset_tracking_state())


def test_team_tracking_score_formula_is_locked() -> None:
    assert compute_consistency_score(
        login_count=1,
        calls_count=30,
        leads_added_count=10,
        followups_done_count=15,
    ) == (100, "high")
    assert compute_consistency_score(
        login_count=1,
        calls_count=15,
        leads_added_count=5,
        followups_done_count=0,
    ) == (42, "medium")
    assert compute_consistency_score(
        login_count=0,
        calls_count=0,
        leads_added_count=0,
        followups_done_count=0,
    ) == (0, "low")
