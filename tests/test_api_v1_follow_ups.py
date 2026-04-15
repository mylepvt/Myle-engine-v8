from __future__ import annotations

import asyncio

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.follow_up import FollowUp
from app.models.lead import Lead
from main import app

from util_jwt_patch import patch_jwt_settings


async def _seed_lead(*, user_id: int, name: str = "Lead A") -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(Lead(name=name, status="new", created_by_user_id=user_id))
        await session.commit()


async def _clear() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(FollowUp))
        await session.execute(delete(Lead))
        await session.commit()


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_follow_ups_requires_auth() -> None:
    r = TestClient(app).get("/api/v1/follow-ups")
    assert r.status_code == 401


def test_slice3_team_forbidden_for_follow_up_queue_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """Legacy `/follow-up` redirects team users; vl2 API enforces same restriction via 403."""
    asyncio.run(_clear())
    asyncio.run(_seed_lead(user_id=3, name="Team lead"))
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        assert c.get("/api/v1/follow-ups").status_code == 403
        assert c.post("/api/v1/follow-ups", json={"lead_id": 1, "note": "x"}).status_code == 403
    finally:
        asyncio.run(_clear())


def test_create_and_list_follow_up(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear())
    asyncio.run(_seed_lead(user_id=2))
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        cr = c.post(
            "/api/v1/follow-ups",
            json={"lead_id": 1, "note": " Call back "},
        )
        assert cr.status_code == 201
        body = cr.json()
        assert body["note"] == "Call back"
        assert body["lead_name"] == "Lead A"
        assert body["completed_at"] is None

        listed = c.get("/api/v1/follow-ups")
        assert listed.status_code == 200
        data = listed.json()
        assert data["total"] == 1
        assert data["items"][0]["note"] == "Call back"
    finally:
        asyncio.run(_clear())


def test_leader_cannot_create_on_others_lead(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear())
    asyncio.run(_seed_lead(user_id=1, name="Admin lead"))
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        r = c.post("/api/v1/follow-ups", json={"lead_id": 1, "note": "x"})
        assert r.status_code == 403
    finally:
        asyncio.run(_clear())


def test_complete_and_reopen_follow_up(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear())
    asyncio.run(_seed_lead(user_id=2))
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        assert c.post("/api/v1/follow-ups", json={"lead_id": 1, "note": "t"}).status_code == 201
        done = c.patch("/api/v1/follow-ups/1", json={"completed": True})
        assert done.status_code == 200
        assert done.json()["completed_at"] is not None
        open_list = c.get("/api/v1/follow-ups", params={"open_only": "true"})
        assert open_list.json()["total"] == 0
        reopen = c.patch("/api/v1/follow-ups/1", json={"completed": False})
        assert reopen.status_code == 200
        assert reopen.json()["completed_at"] is None
    finally:
        asyncio.run(_clear())
