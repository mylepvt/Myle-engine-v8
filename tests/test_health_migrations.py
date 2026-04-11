from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_migrations_shape() -> None:
    res = client.get("/health/migrations")
    assert res.status_code == 200
    body = res.json()
    assert "alembic_heads" in body
    assert isinstance(body["alembic_heads"], list)
    assert "current_revision" in body
    assert "at_head" in body
