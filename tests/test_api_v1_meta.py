import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_meta_public_shape() -> None:
    res = client.get("/api/v1/meta")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "myle-vl2"
    assert body["api_version"] == 1
    assert "environment" in body
    assert "auth_dev_login_enabled" in body
    assert body["auth_dev_login_enabled"] in (True, False)
    assert body["features"] == {}


def test_meta_auth_dev_login_flag_respects_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.api.v1.meta as meta_mod
    from app.core.config import settings as real_settings

    fake = real_settings.model_copy(
        update={"auth_dev_login_enabled": True, "app_environment": "development"},
    )
    monkeypatch.setattr(meta_mod, "settings", fake)
    res = client.get("/api/v1/meta")
    assert res.status_code == 200
    assert res.json()["auth_dev_login_enabled"] is True


def test_meta_environment_flag_respects_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.api.v1.meta as meta_mod
    from app.core.config import settings as real_settings

    fake = real_settings.model_copy(
        update={
            "app_environment": "test",
            "auth_dev_login_enabled": False,
        },
    )
    monkeypatch.setattr(meta_mod, "settings", fake)
    res = client.get("/api/v1/meta")
    assert res.status_code == 200
    assert res.json()["features"] == {}
    assert res.json()["environment"] == "test"
