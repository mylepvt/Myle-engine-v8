from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.crm_outbox import CrmOutbox
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


async def _clear_leads() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(FollowUp))
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(Lead))
        await session.commit()


async def _seed_lead(
    *,
    user_id: int = 2,
    name: str = "CTCS Lead",
    status: str = "new_lead",
    phone: str = "9876500000",
    city: str = "Mumbai",
    last_action_at: datetime | None = None,
    created_by_user_id: int | None = None,
    assigned_to_user_id: int | None = None,
) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            Lead(
                name=name,
                status=status,
                created_by_user_id=created_by_user_id if created_by_user_id is not None else user_id,
                assigned_to_user_id=assigned_to_user_id if assigned_to_user_id is not None else user_id,
                phone=phone,
                city=city,
                last_action_at=last_action_at,
            ),
        )
        await session.commit()


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    return c


def test_ctcs_list_rejects_unknown_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    r = c.get("/api/v1/leads", params={"ctcs_filter": "nope"})
    assert r.status_code == 422


def test_ctcs_list_accepts_filter_and_priority_sort(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    try:
        c = _authed(monkeypatch)
        r = c.get("/api/v1/leads", params={"ctcs_filter": "today", "ctcs_priority_sort": "true"})
        assert r.status_code == 200
        assert r.json()["total"] == 0
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_interested_updates_lead(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        listed = c.get("/api/v1/leads")
        assert listed.status_code == 200
        lead_id = listed.json()["items"][0]["id"]

        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "interested"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "video_sent"
        assert body["call_status"] == "video_sent"
        assert int(body.get("heat_score", 0)) >= 20
        assert body.get("last_action_at") is not None
        assert body.get("whatsapp_sent_at") is not None
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_not_picked_sets_followup(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "not_picked"})
        assert r.status_code == 200, r.text
        nfu = r.json().get("next_followup_at")
        assert nfu is not None
        assert r.json()["status"] == "contacted"
        # +10 first-time contacted, −5 not_picked
        assert int(r.json().get("heat_score", 0)) == 5
    finally:
        asyncio.run(_clear_leads())


def test_team_ctcs_action_works_for_leader_assigned_lead(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead(user_id=2, created_by_user_id=2, assigned_to_user_id=3))
    try:
        patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
        c = TestClient(app)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        r = c.post("/api/v1/leads/1/action", json={"action": "not_picked"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "contacted"
        assert r.json()["next_followup_at"] is not None
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_call_later_default_followup(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "call_later"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "contacted"
        assert r.json().get("next_followup_at") is not None
        assert int(r.json().get("heat_score", 0)) == 10
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_call_later_custom_followup_at(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        when = datetime.now(timezone.utc) + timedelta(hours=48)
        iso = when.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        r = c.post(
            f"/api/v1/leads/{lead_id}/action",
            json={"action": "call_later", "followup_at": iso},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "contacted"
        assert r.json().get("next_followup_at") is not None
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_followup_at_rejected_for_non_call_later(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        when = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        r = c.post(
            f"/api/v1/leads/{lead_id}/action",
            json={"action": "not_picked", "followup_at": when},
        )
        assert r.status_code == 422
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_paid_requires_approved_proof(monkeypatch: pytest.MonkeyPatch) -> None:
    """'paid' CTCS action requires payment_status == 'approved' — blocked without proof."""
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        # No proof uploaded → must be blocked
        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "paid"})
        assert r.status_code == 400, r.text
        assert "proof" in r.json()["error"]["message"].lower()
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_call_log_bumps_heat_when_entering_contacted(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        assert c.post(f"/api/v1/leads/{lead_id}/call-log").status_code == 201
        detail = c.get(f"/api/v1/leads/{lead_id}").json()
        assert detail["status"] == "contacted"
        assert int(detail.get("heat_score", 0)) >= 10
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_not_interested_archives(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "not_interested"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "lost"
        assert r.json().get("is_archived") is True
    finally:
        asyncio.run(_clear_leads())


def test_patch_next_followup_does_not_reset_stage_timer(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        when = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        r = c.patch(f"/api/v1/leads/{lead_id}", json={"next_followup_at": when})
        assert r.status_code == 200, r.text
        assert r.json().get("next_followup_at") is not None
        assert r.json().get("last_action_at") is None
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_action_call_later_keeps_stage_timer_when_stage_is_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    anchor = datetime(2026, 4, 20, 12, 0, tzinfo=timezone.utc)
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead(status="contacted", last_action_at=anchor))
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        r = c.post(f"/api/v1/leads/{lead_id}/action", json={"action": "call_later"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "contacted"
        assert r.json()["last_action_at"].startswith("2026-04-20T12:00:00")
    finally:
        asyncio.run(_clear_leads())


def test_ctcs_call_log_creates_event(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_lead())
    try:
        c = _authed(monkeypatch)
        lead_id = c.get("/api/v1/leads").json()["items"][0]["id"]
        r = c.post(f"/api/v1/leads/{lead_id}/call-log")
        assert r.status_code == 201, r.text
        assert r.json()["outcome"] == "no_answer"
    finally:
        asyncio.run(_clear_leads())
