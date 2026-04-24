from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.time_ist import today_ist
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_team_members_requires_auth() -> None:
    res = client.get("/api/v1/team/members")
    assert res.status_code == 401


def test_team_members_admin_lists_users(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    res = c.get("/api/v1/team/members")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    emails = {x["email"] for x in body["items"]}
    assert "dev-admin@myle.local" in emails
    team_row = next(x for x in body["items"] if x["email"] == "dev-team@myle.local")
    assert team_row["upline_user_id"] == 2
    assert team_row["leader_user_id"] == 2
    assert team_row["leader_name"] == "TestLeaderDisplay"
    assert all("hashed_password" not in x for x in body["items"])
    assert all("password" not in str(x) for x in body["items"])


def test_team_members_forbidden_for_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/team/members").status_code == 403


def test_create_team_member_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    res = c.post(
        "/api/v1/team/members",
        json={
            "fbo_id": "new-member-fbo-001",
            "email": "new-member@myle.local",
            "password": "password123",
            "role": "team",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["fbo_id"] == "new-member-fbo-001"
    assert body["email"] == "new-member@myle.local"
    assert body["role"] == "team"
    assert "id" in body
    listed = c.get("/api/v1/team/members")
    emails = {x["email"] for x in listed.json()["items"]}
    assert "new-member@myle.local" in emails


def test_create_team_member_duplicate_email(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    payload = {
        "fbo_id": "duplicate-email-test-001",
        "email": "dev-leader@myle.local",
        "password": "password123",
        "role": "team",
    }
    assert c.post("/api/v1/team/members", json=payload).status_code == 409


def test_create_team_member_duplicate_fbo_id(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    payload = {
        "fbo_id": "fbo-leader-001",
        "email": "someone-else@myle.local",
        "password": "password123",
        "role": "team",
    }
    assert c.post("/api/v1/team/members", json=payload).status_code == 409


def test_create_team_member_forbidden_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    res = c.post(
        "/api/v1/team/members",
        json={
            "fbo_id": "x-fbo-001",
            "email": "x@myle.local",
            "password": "password123",
            "role": "team",
        },
    )
    assert res.status_code == 403


def test_admin_can_manage_member_compliance_controls(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    grace_till = (today_ist() + timedelta(days=2)).isoformat()

    grace = c.patch(
        "/api/v1/team/members/3/compliance",
        json={
            "action": "grant_grace",
            "grace_end_date": grace_till,
            "reason": "Approved leave",
        },
    )
    assert grace.status_code == 200
    grace_body = grace.json()
    assert grace_body["discipline_status"] == "grace"
    assert grace_body["grace_end_date"] == grace_till
    assert grace_body["compliance_level"] in {"grace", "grace_ending"}

    removed = c.patch(
        "/api/v1/team/members/3/compliance",
        json={
            "action": "remove_now",
            "reason": "Manual admin action",
        },
    )
    assert removed.status_code == 200
    removed_body = removed.json()
    assert removed_body["access_blocked"] is True
    assert removed_body["discipline_status"] == "removed"
    assert removed_body["compliance_level"] == "removed"

    restored = c.patch(
        "/api/v1/team/members/3/compliance",
        json={"action": "restore_access"},
    )
    assert restored.status_code == 200
    restored_body = restored.json()
    assert restored_body["access_blocked"] is False
    assert restored_body["discipline_status"] == "active"
    assert restored_body["compliance_level"] == "clear"


def test_team_can_request_and_cancel_own_grace(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    grace_till = (today_ist() + timedelta(days=2)).isoformat()

    requested = c.put(
        "/api/v1/team/me/grace-request",
        json={
            "grace_end_date": grace_till,
            "reason": "Family event",
        },
    )
    assert requested.status_code == 200
    requested_body = requested.json()
    assert requested_body["role"] == "team"
    assert requested_body["grace_request_end_date"] == grace_till
    assert requested_body["grace_request_reason"] == "Family event"
    assert requested_body["discipline_status"] == "active"
    assert requested_body["grace_end_date"] is None

    cancelled = c.delete("/api/v1/team/me/grace-request")
    assert cancelled.status_code == 200
    cancelled_body = cancelled.json()
    assert cancelled_body["grace_request_end_date"] is None
    assert cancelled_body["grace_request_reason"] is None


def test_leader_can_request_grace_and_admin_can_approve(monkeypatch: pytest.MonkeyPatch) -> None:
    leader = _authed_client(monkeypatch)
    assert leader.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    grace_till = (today_ist() + timedelta(days=3)).isoformat()

    requested = leader.put(
        "/api/v1/team/me/grace-request",
        json={
            "grace_end_date": grace_till,
            "reason": "Travel leave",
        },
    )
    assert requested.status_code == 200
    assert requested.json()["grace_request_end_date"] == grace_till

    admin = _authed_client(monkeypatch)
    assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    listed = admin.get("/api/v1/team/members")
    assert listed.status_code == 200
    leader_row = next(item for item in listed.json()["items"] if item["role"] == "leader")
    assert leader_row["grace_request_end_date"] == grace_till

    approved = admin.patch(
        "/api/v1/team/members/2/compliance",
        json={"action": "approve_grace_request"},
    )
    assert approved.status_code == 200
    approved_body = approved.json()
    assert approved_body["role"] == "leader"
    assert approved_body["discipline_status"] == "grace"
    assert approved_body["grace_end_date"] == grace_till
    assert approved_body["grace_request_end_date"] is None


def test_create_team_member_short_password(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    res = c.post(
        "/api/v1/team/members",
        json={
            "fbo_id": "short-pw-fbo",
            "email": "short-pw@myle.local",
            "password": "short",
            "role": "team",
        },
    )
    assert res.status_code == 422


def test_my_team_leader_returns_self_and_downline_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    res = c.get("/api/v1/team/my-team")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    assert len(body["items"]) == body["total"]
    leader_rows = [x for x in body["items"] if x["email"] == "dev-leader@myle.local"]
    assert len(leader_rows) == 1
    assert leader_rows[0]["fbo_id"] == "fbo-leader-001"
    assert leader_rows[0]["role"] == "leader"
    assert body.get("direct_members", 0) >= 0
    assert body.get("total_downline", 0) == max(0, body["total"] - 1)


def test_my_team_team_user_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    res = c.get("/api/v1/team/my-team")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["email"] == "dev-team@myle.local"
    assert body["items"][0]["upline_user_id"] == 2
    assert body["items"][0]["leader_user_id"] == 2
    assert body["items"][0]["leader_name"] == "TestLeaderDisplay"


def test_my_team_accessible_for_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    """Admin can access /my-team (returns their own record or empty list)."""
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/team/my-team").status_code == 200


def test_admin_training_put_forbidden_for_team(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    res = c.put("/api/v1/admin/training/day/1", json={"title": "x"})
    assert res.status_code == 403


def test_enrollment_requests_empty_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    res = c.get("/api/v1/team/enrollment-requests")
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0, "limit": 50, "offset": 0}


def test_enrollment_requests_empty_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    res = c.get("/api/v1/team/enrollment-requests")
    assert res.status_code == 200
    assert res.json()["total"] == 0


def test_enrollment_requests_forbidden_for_team(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/team/enrollment-requests").status_code == 403
