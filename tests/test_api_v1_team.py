from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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
