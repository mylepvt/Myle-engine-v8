from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.lead_status import WORKBOARD_COLUMNS
from app.models.lead import Lead
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


async def _seed_lead(
    *,
    user_id: int,
    name: str,
    lead_status: str,
    archived_at: datetime | None = None,
    in_pool: bool = False,
    deleted_at: datetime | None = None,
    call_status: str | None = None,
    created_by_user_id: int | None = None,
    assigned_to_user_id: int | None = None,
) -> None:
    fac = test_conftest.get_test_session_factory()
    cb = created_by_user_id if created_by_user_id is not None else user_id
    at = assigned_to_user_id if assigned_to_user_id is not None else user_id
    async with fac() as session:
        session.add(
            Lead(
                name=name,
                status=lead_status,
                created_by_user_id=cb,
                assigned_to_user_id=at,
                archived_at=archived_at,
                in_pool=in_pool,
                deleted_at=deleted_at,
                call_status=call_status,
            )
        )
        await session.commit()


async def _clear_leads() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(Lead))
        await session.commit()


def _authed_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_workboard_requires_auth() -> None:
    res = client.get("/api/v1/workboard")
    assert res.status_code == 401


def test_workboard_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    res = c.get("/api/v1/workboard")
    assert res.status_code == 200
    body = res.json()
    assert body["max_rows_fetched"] == 300
    assert len(body["columns"]) == len(WORKBOARD_COLUMNS)
    assert body["action_counts"]["pending_calls"] == 0
    assert body["action_counts"]["videos_to_send"] == 0
    for col in body["columns"]:
        assert col["total"] == 0
        assert col["items"] == []


def test_workboard_groups_and_scopes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_lead(user_id=2, name="L1", lead_status="new_lead"))
    asyncio.run(_seed_lead(user_id=2, name="L2", lead_status="converted"))
    asyncio.run(_seed_lead(user_id=1, name="Admin only", lead_status="new_lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/workboard")
        assert res.status_code == 200
        body = res.json()
        by_status = {c["status"]: c for c in body["columns"]}
        assert by_status["new_lead"]["total"] == 1
        assert by_status["converted"]["total"] == 1
        assert len(by_status["new_lead"]["items"]) == 1
        assert by_status["new_lead"]["items"][0]["name"] == "L1"

        c2 = _authed_client(monkeypatch)
        assert c2.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res2 = c2.get("/api/v1/workboard")
        by2 = {c["status"]: c for c in res2.json()["columns"]}
        assert by2["new_lead"]["total"] == 2
    finally:
        asyncio.run(_clear_leads())


def test_workboard_excludes_pool_and_soft_deleted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_lead(user_id=2, name="Pooled", lead_status="new_lead", in_pool=True))
    asyncio.run(
        _seed_lead(
            user_id=2,
            name="Deleted",
            lead_status="new_lead",
            deleted_at=datetime.now(timezone.utc),
        )
    )
    asyncio.run(_seed_lead(user_id=2, name="Active", lead_status="new_lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/workboard")
        by_status = {col["status"]: col for col in res.json()["columns"]}
        assert by_status["new_lead"]["total"] == 1
        assert len(by_status["new_lead"]["items"]) == 1
        assert by_status["new_lead"]["items"][0]["name"] == "Active"
    finally:
        asyncio.run(_clear_leads())


def test_workboard_action_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_lead(
            user_id=3,
            name="NeedCall",
            lead_status="new_lead",
            call_status="not_called",
        )
    )
    asyncio.run(
        _seed_lead(
            user_id=3,
            name="ShareVid",
            lead_status="invited",
            call_status="interested",
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.get("/api/v1/workboard")
        ac = res.json()["action_counts"]
        assert ac["pending_calls"] == 1
        assert ac["videos_to_send"] == 2
        assert "batches_due" in ac
        assert "closings_due" in ac
    finally:
        asyncio.run(_clear_leads())


def test_leader_sees_downline_created_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Leader visibility includes leads created by team members under them (upline tree)."""
    asyncio.run(
        _seed_lead(user_id=3, name="FromTeamMember", lead_status="new_lead")
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/workboard")
        assert res.status_code == 200
        by_status = {col["status"]: col for col in res.json()["columns"]}
        assert by_status["new_lead"]["total"] == 1
        assert len(by_status["new_lead"]["items"]) == 1
        assert by_status["new_lead"]["items"][0]["name"] == "FromTeamMember"
    finally:
        asyncio.run(_clear_leads())


def test_slice2_team_workboard_uses_assignment_not_creator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy `/working` scopes team by assignee; vl2 mirrors via execution visibility."""
    asyncio.run(
        _seed_lead(
            user_id=2,
            name="LeaderCreatedAssignedToTeam",
            lead_status="new_lead",
            created_by_user_id=2,
            assigned_to_user_id=3,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        body = c.get("/api/v1/workboard/leads").json()
        by_status = {col["status"]: col for col in body["columns"]}
        assert by_status["new_lead"]["total"] == 1
        assert by_status["new_lead"]["items"][0]["name"] == "LeaderCreatedAssignedToTeam"
    finally:
        asyncio.run(_clear_leads())


def test_slice2_team_workboard_hides_unassigned_self_created_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If team created a lead but assignment moved away, `/working` should not show it."""
    asyncio.run(
        _seed_lead(
            user_id=3,
            name="TeamCreatedButAssignedToLeader",
            lead_status="new_lead",
            created_by_user_id=3,
            assigned_to_user_id=2,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        body = c.get("/api/v1/workboard/leads").json()
        by_status = {col["status"]: col for col in body["columns"]}
        assert by_status["new_lead"]["total"] == 0
    finally:
        asyncio.run(_clear_leads())


def test_workboard_excludes_archived_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_lead(user_id=2, name="Active", lead_status="new_lead"))
    asyncio.run(
        _seed_lead(
            user_id=2,
            name="Archived",
            lead_status="new_lead",
            archived_at=datetime.now(timezone.utc),
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/workboard")
        by_status = {col["status"]: col for col in res.json()["columns"]}
        assert by_status["new_lead"]["total"] == 1
        assert len(by_status["new_lead"]["items"]) == 1
        assert by_status["new_lead"]["items"][0]["name"] == "Active"
    finally:
        asyncio.run(_clear_leads())


def test_workboard_summary_and_stale_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    old_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
    asyncio.run(
        _seed_lead(
            user_id=2,
            name="OldNeedCall",
            lead_status="new_lead",
            call_status="not_called",
        )
    )
    fac = test_conftest.get_test_session_factory()

    async def _touch_old() -> None:
        async with fac() as session:
            row = await session.get(Lead, 1)
            assert row is not None
            row.created_at = old_time
            row.last_called_at = old_time
            await session.commit()

    asyncio.run(_touch_old())
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        summary = c.get("/api/v1/workboard/summary", params={"stale_hours": 1})
        assert summary.status_code == 200
        sb = summary.json()
        assert "action_counts" in sb
        assert "stale_total" in sb
        assert sb["stale_total"] == 1

        stale = c.get("/api/v1/workboard/stale", params={"stale_hours": 1, "limit": 20})
        assert stale.status_code == 200
        body = stale.json()
        assert body["total"] == 1
        assert body["stale_hours"] == 1
        assert body["items"][0]["name"] == "OldNeedCall"
    finally:
        asyncio.run(_clear_leads())


def test_workboard_leads_endpoint_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_seed_lead(user_id=2, name="LeadA", lead_status="new_lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/workboard/leads")
        assert res.status_code == 200
        body = res.json()
        assert "columns" in body
        assert "max_rows_fetched" in body
        by_status = {col["status"]: col for col in body["columns"]}
        assert by_status["new_lead"]["total"] == 1
    finally:
        asyncio.run(_clear_leads())


def test_leader_workboard_hides_pending_and_video_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_seed_lead(user_id=2, name="NeedCall", lead_status="new_lead", call_status="not_called"))
    asyncio.run(_seed_lead(user_id=2, name="Invite", lead_status="invited", call_status="interested"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        body = c.get("/api/v1/workboard").json()
        assert body["action_counts"]["pending_calls"] == 0
        assert body["action_counts"]["videos_to_send"] == 0
    finally:
        asyncio.run(_clear_leads())
