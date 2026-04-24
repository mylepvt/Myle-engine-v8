import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

import pytest
from sqlalchemy import delete, select

from app.core.passwords import DEV_LOGIN_PASSWORD_PLAIN, hash_password
from app.models.user import User
from main import app

from conftest import get_test_session_factory
from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def test_password_login_with_username_same_as_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy allowed login by exact username when FBO match failed."""
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "TestLeaderDisplay", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 200
    me = client.get("/api/v1/auth/me")
    assert me.json().get("fbo_id") == "fbo-leader-001"


def test_password_login_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["authenticated"] is True
    assert body["role"] == "leader"
    assert body.get("fbo_id") == "fbo-leader-001"


def test_password_login_wrong_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": "wrong"},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_password_login_unknown_fbo_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-does-not-exist", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 401


def test_password_login_rejects_pending_registration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy blocks login until admin approves (``status=pending``)."""
    patch_jwt_settings(monkeypatch)
    fbo = "pending-reg-001"

    async def seed_pending() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            session.add(
                User(
                    fbo_id=fbo,
                    email="pending-reg-001@test.local",
                    role="team",
                    hashed_password=hash_password(DEV_LOGIN_PASSWORD_PLAIN),
                    upline_user_id=1,
                    registration_status="pending",
                )
            )
            await session.commit()

    async def cleanup_pending() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            await session.execute(delete(User).where(User.fbo_id == fbo))
            await session.commit()

    try:
        asyncio.run(seed_pending())
        res = client.post(
            "/api/v1/auth/login",
            json={"fbo_id": fbo, "password": DEV_LOGIN_PASSWORD_PLAIN},
        )
        assert res.status_code == 403
        assert "pending" in res.json()["error"]["message"].lower()
    finally:
        asyncio.run(cleanup_pending())


def test_password_login_blocks_after_four_missed_reports(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)
    fbo = "discipline-report-004"
    email = "discipline-report-004@test.local"

    async def seed_user() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            session.add(
                User(
                    fbo_id=fbo,
                    email=email,
                    role="team",
                    hashed_password=hash_password(DEV_LOGIN_PASSWORD_PLAIN),
                    upline_user_id=2,
                    registration_status="approved",
                    created_at=datetime.now(timezone.utc) - timedelta(days=6),
                )
            )
            await session.commit()

    async def cleanup_user() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            await session.execute(delete(User).where(User.fbo_id == fbo))
            await session.commit()

    try:
        asyncio.run(seed_user())
        res = client.post(
            "/api/v1/auth/login",
            json={"fbo_id": fbo, "password": DEV_LOGIN_PASSWORD_PLAIN},
        )
        assert res.status_code == 403
        assert "remove" in res.json()["error"]["message"].lower()

        async def assert_removed() -> None:
            factory = get_test_session_factory()
            async with factory() as session:
                row = (
                    await session.execute(select(User).where(User.fbo_id == fbo))
                ).scalar_one()
                assert row.access_blocked is True
                assert row.discipline_status == "removed"

        asyncio.run(assert_removed())
    finally:
        asyncio.run(cleanup_user())


def test_lookup_upline_fbo_admin_verified(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_jwt_settings(monkeypatch)
    res = client.get("/api/v1/auth/lookup-upline-fbo", params={"fbo_id": "fbo-admin-001"})
    assert res.status_code == 200
    body = res.json()
    assert body["found"] is True
    assert body["is_valid_upline"] is True
    assert body["is_leader"] is True


def test_password_login_remember_me_extends_refresh_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)
    res = client.post(
        "/api/v1/auth/login",
        json={
            "fbo_id": "fbo-leader-001",
            "password": DEV_LOGIN_PASSWORD_PLAIN,
            "remember_me": True,
        },
    )
    assert res.status_code == 200
    set_cookie = ",".join(res.headers.get_list("set-cookie"))
    assert "myle_refresh=" in set_cookie
    assert "Max-Age=5184000" in set_cookie  # 60 days


def test_password_login_applies_secure_cross_site_cookie_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(
        monkeypatch,
        session_cookie_secure=True,
        auth_cookie_samesite="none",
    )
    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 200
    set_cookie = ",".join(res.headers.get_list("set-cookie")).lower()
    assert "secure" in set_cookie
    assert "samesite=none" in set_cookie
