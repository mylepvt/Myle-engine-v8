"""Smoke tests for execution enforcement routes (vl2 service port)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.time_ist import today_ist
from app.models.activity_log import ActivityLog
from app.models.batch_day_submission import BatchDaySubmission
from app.models.call_event import CallEvent
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.models.user import User
from main import app

from conftest import get_test_session_factory
from util_jwt_patch import patch_jwt_settings


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


async def _reset_execution_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(BatchDaySubmission))
        await session.execute(delete(EnrollShareLink))
        await session.execute(delete(CallEvent))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
        await session.execute(delete(User).where(User.id > 3))
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


async def _seed_lead_control_data() -> dict[str, int]:
    factory = get_test_session_factory()
    now = datetime.now(timezone.utc)
    async with factory() as session:
        team_target = User(
            fbo_id="lead-control-team",
            username="lead_control_team",
            email="lead-control-team@example.com",
            role="team",
            registration_status="approved",
            xp_total=444,
        )
        leader_target = User(
            fbo_id="lead-control-leader",
            username="lead_control_leader",
            email="lead-control-leader@example.com",
            role="leader",
            registration_status="approved",
            xp_total=222,
        )
        session.add_all([team_target, leader_target])
        await session.flush()

        lead = Lead(
            name="Queued Watch Lead",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            archived_at=now - timedelta(hours=26),
            created_at=now - timedelta(hours=52),
            last_action_at=now - timedelta(hours=52),
            phone="9777777777",
        )
        incubating_lead = Lead(
            name="Archived Watch Lead",
            status="video_watched",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            archived_at=now - timedelta(hours=4),
            created_at=now - timedelta(hours=30),
            last_action_at=now - timedelta(hours=30),
            phone="9888888888",
        )
        session.add_all([lead, incubating_lead])
        await session.flush()

        session.add_all(
            [
                EnrollShareLink(
                    token="lead-control-watch-token",
                    lead_id=lead.id,
                    created_by_user_id=1,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=now - timedelta(hours=52),
                    last_viewed_at=now - timedelta(hours=52),
                    expires_at=now + timedelta(minutes=30),
                ),
                EnrollShareLink(
                    token="lead-control-incubating-token",
                    lead_id=incubating_lead.id,
                    created_by_user_id=1,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=now - timedelta(hours=30),
                    last_viewed_at=now - timedelta(hours=30),
                    expires_at=now + timedelta(minutes=30),
                ),
            ]
        )
        session.add(
            BatchDaySubmission(
                lead_id=lead.id,
                day_number=2,
                slot="d2_morning",
                notes_url="/uploads/day2-note.pdf",
                voice_note_url="/uploads/day2-voice.m4a",
                video_url="/uploads/day2-video.mp4",
                notes_text="Shared Day 2 notes for admin review.",
            )
        )
        await session.commit()
        return {
            "lead_id": lead.id,
            "incubating_lead_id": incubating_lead.id,
            "team_target_id": team_target.id,
            "leader_target_id": leader_target.id,
        }


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
    assert c.get("/api/v1/execution/lead-control").status_code == 200
    assert c.get("/api/v1/execution/day2-review").status_code == 200
    stale = c.post("/api/v1/execution/stale-redistribute")
    assert stale.status_code == 200
    assert isinstance(stale.json().get("implemented"), bool)


def test_team_cannot_admin_leak_map(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/execution/leak-map").status_code == 403
    assert c.get("/api/v1/execution/lead-control").status_code == 403
    assert c.get("/api/v1/execution/day2-review").status_code == 403


def test_admin_lead_control_surface_exposes_queue_and_assignable_users(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_execution_tables())
    try:
        seeded = asyncio.run(_seed_lead_control_data())
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        response = c.get("/api/v1/execution/lead-control")
        assert response.status_code == 200
        body = response.json()
        assert body["queue_total"] == 1
        assert body["queue"][0]["lead_id"] == seeded["lead_id"]
        assert body["queue"][0]["owner_user_id"] == 3
        assert body["incubation_total"] == 1
        assert body["incubation_queue"][0]["lead_id"] == seeded["incubating_lead_id"]
        assignable_ids = {row["user_id"] for row in body["assignable_users"]}
        assert seeded["team_target_id"] in assignable_ids
        assert seeded["leader_target_id"] in assignable_ids
    finally:
        asyncio.run(_reset_execution_tables())


def test_admin_day2_review_surface_exposes_recent_submissions(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_execution_tables())
    try:
        seeded = asyncio.run(_seed_lead_control_data())
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        response = c.get("/api/v1/execution/day2-review")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["notes_count"] == 1
        assert body["voice_count"] == 1
        assert body["video_count"] == 1
        assert body["submissions"][0]["lead_id"] == seeded["lead_id"]
        assert body["submissions"][0]["owner_user_id"] == 3
    finally:
        asyncio.run(_reset_execution_tables())


def test_admin_manual_reassign_preserves_owner_and_creates_soft_log(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_execution_tables())
    try:
        seeded = asyncio.run(_seed_lead_control_data())
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        response = c.post(
            "/api/v1/execution/lead-control/reassign",
            json={
                "lead_id": seeded["lead_id"],
                "to_user_id": seeded["team_target_id"],
                "reason": "Admin moved this lead for fresh follow-up.",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["lead_id"] == seeded["lead_id"]
        assert body["assigned_to_user_id"] == seeded["team_target_id"]
        assert body["owner_user_id"] == 3

        async def _assert_db() -> None:
            factory = get_test_session_factory()
            async with factory() as session:
                lead = await session.get(Lead, seeded["lead_id"])
                assert lead is not None
                assert lead.owner_user_id == 3
                assert lead.assigned_to_user_id == seeded["team_target_id"]
                assert lead.archived_at is None
                logs = (
                    await session.execute(
                        select(ActivityLog)
                        .where(ActivityLog.action == "lead.manual_watch_reassigned")
                        .order_by(ActivityLog.id.desc())
                    )
                ).scalars().all()
                assert len(logs) == 1
                assert logs[0].entity_id == seeded["lead_id"]
                assert logs[0].meta["assigned_to_user_id"] == seeded["team_target_id"]
                assert logs[0].meta["owner_user_id"] == 3

        asyncio.run(_assert_db())

        history_response = c.get("/api/v1/execution/lead-control")
        assert history_response.status_code == 200
        history_body = history_response.json()
        assert history_body["queue_total"] == 0
        assert history_body["history_total"] >= 1
        assert history_body["history"][0]["mode"] == "manual"
        assert history_body["history"][0]["assigned_to_user_id"] == seeded["team_target_id"]
    finally:
        asyncio.run(_reset_execution_tables())
