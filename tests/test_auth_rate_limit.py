"""Rate limit middleware (must override autouse disable in conftest)."""

from fastapi.testclient import TestClient

import pytest

from main import app


def test_auth_post_rate_limit_returns_429(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg
    import app.middleware.auth_rate_limit as mod

    mod._reset_rate_limit_store_for_tests()

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={
            "auth_login_rate_limit_per_minute": 2,
            "redis_url": "",
        }),
    )

    client = TestClient(app)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert client.post("/api/v1/auth/refresh").status_code == 401
    res = client.post("/api/v1/auth/refresh")
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "too_many_requests"


def test_auth_post_rate_limit_separates_forwarded_clients_behind_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg
    import app.middleware.auth_rate_limit as mod

    mod._reset_rate_limit_store_for_tests()

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={
            "auth_login_rate_limit_per_minute": 1,
            "redis_url": "",
        }),
    )

    client = TestClient(app, client=("10.0.0.8", 50000))

    first_client = client.post(
        "/api/v1/auth/refresh",
        headers={"X-Forwarded-For": "198.51.100.10"},
    )
    second_client = client.post(
        "/api/v1/auth/refresh",
        headers={"X-Forwarded-For": "198.51.100.11"},
    )
    repeated_first_client = client.post(
        "/api/v1/auth/refresh",
        headers={"X-Forwarded-For": "198.51.100.10"},
    )

    assert first_client.status_code == 401
    assert second_client.status_code == 401
    assert repeated_first_client.status_code == 429
    assert repeated_first_client.json()["error"]["code"] == "too_many_requests"


def test_auth_post_rate_limit_uses_cloudflare_client_ip_when_proxy_host_is_public(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg
    import app.middleware.auth_rate_limit as mod

    mod._reset_rate_limit_store_for_tests()

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={
            "auth_login_rate_limit_per_minute": 1,
            "redis_url": "",
        }),
    )

    client = TestClient(app, client=("8.8.8.8", 50000))

    first_client = client.post(
        "/api/v1/auth/refresh",
        headers={"CF-Connecting-IP": "198.51.100.10"},
    )
    second_client = client.post(
        "/api/v1/auth/refresh",
        headers={"CF-Connecting-IP": "198.51.100.11"},
    )
    repeated_first_client = client.post(
        "/api/v1/auth/refresh",
        headers={"CF-Connecting-IP": "198.51.100.10"},
    )

    assert first_client.status_code == 401
    assert second_client.status_code == 401
    assert repeated_first_client.status_code == 429
    assert repeated_first_client.json()["error"]["code"] == "too_many_requests"


def test_auth_post_rate_limit_separates_login_identifiers_when_edge_ip_is_shared(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg
    import app.middleware.auth_rate_limit as mod

    mod._reset_rate_limit_store_for_tests()

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={
            "auth_login_rate_limit_per_minute": 1,
            "redis_url": "",
        }),
    )

    client = TestClient(app, client=("8.8.8.8", 50000))

    first_login = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": "wrong"},
    )
    second_login = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-admin-001", "password": "wrong"},
    )
    repeated_first_login = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": "wrong"},
    )

    assert first_login.status_code == 401
    assert second_login.status_code == 401
    assert repeated_first_login.status_code == 429
    assert repeated_first_login.json()["error"]["code"] == "too_many_requests"


def test_auth_post_rate_limit_falls_back_to_inmemory_when_redis_eval_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg
    import app.middleware.auth_rate_limit as mod

    class BrokenRedis:
        async def eval(self, *_args, **_kwargs):
            raise RuntimeError("redis down")

    mod._reset_rate_limit_store_for_tests()
    mod._redis = BrokenRedis()
    mod._redis_available = True

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={
            "auth_login_rate_limit_per_minute": 1,
            "redis_url": "redis://broken.example:6379/0",
        }),
    )

    client = TestClient(app)

    first_request = client.post("/api/v1/auth/refresh")
    repeated_request = client.post("/api/v1/auth/refresh")

    assert first_request.status_code == 401
    assert repeated_request.status_code == 429
    assert repeated_request.json()["error"]["code"] == "too_many_requests"
