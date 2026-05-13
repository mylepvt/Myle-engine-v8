from fastapi.testclient import TestClient

import pytest

from main import app


def test_csrf_rejection_sets_fresh_cookie_and_next_retry_can_pass_csrf_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.config as cfg

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={"csrf_enabled": True}),
    )

    client = TestClient(app)

    first = client.post("/api/v1/team/members", json={"name": "A"})
    assert first.status_code == 403
    assert first.json()["error"]["code"] == "csrf_invalid"

    csrf_token = client.cookies.get("csrf_token")
    assert csrf_token

    second = client.post(
        "/api/v1/team/members",
        json={"name": "A"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second.status_code != 403 or second.json()["error"]["code"] != "csrf_invalid"
