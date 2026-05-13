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
