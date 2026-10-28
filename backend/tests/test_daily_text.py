"""Daily text: admin writes one message per day; members read up to today."""
from __future__ import annotations

from datetime import timedelta

from app.api.deps import AuthUser, require_auth_user
from app.core.time_ist import today_ist


def _as(role: str) -> None:
    """Switch who the shared test client is signed in as."""
    from main import app

    app.dependency_overrides[require_auth_user] = lambda: AuthUser(user_id=300, role=role, email=f"{role}@test.myle")


async def test_admin_sets_and_member_reads_today(admin_client):
    today = today_ist().isoformat()
    r = await admin_client.put(f"/api/v1/daily-text/{today}", json={"headline": "  Keep going  ", "body": "Line 1\nLine 2"})
    assert r.status_code == 200
    assert r.json()["entry"]["headline"] == "Keep going"

    _as("team")
    r = await admin_client.get("/api/v1/daily-text")
    assert r.status_code == 200
    data = r.json()
    assert data["date"] == today
    assert data["entry"]["headline"] == "Keep going"
    assert data["entry"]["body"] == "Line 1\nLine 2"


async def test_update_replaces_and_delete_clears(admin_client):
    day = (today_ist() - timedelta(days=3)).isoformat()
    await admin_client.put(f"/api/v1/daily-text/{day}", json={"headline": "First"})
    r = await admin_client.put(f"/api/v1/daily-text/{day}", json={"headline": "Second", "body": "   "})
    assert r.json()["entry"] == {**r.json()["entry"], "headline": "Second", "body": None}

    r = await admin_client.get("/api/v1/daily-text", params={"date": day})
    assert r.json()["entry"]["headline"] == "Second"

    r = await admin_client.delete(f"/api/v1/daily-text/{day}")
    assert r.status_code == 200
    r = await admin_client.get("/api/v1/daily-text", params={"date": day})
    assert r.json()["entry"] is None


async def test_future_day_hidden_from_members_not_admin(admin_client):
    tomorrow = (today_ist() + timedelta(days=1)).isoformat()
    await admin_client.put(f"/api/v1/daily-text/{tomorrow}", json={"headline": "Planned"})

    _as("team")
    r = await admin_client.get("/api/v1/daily-text", params={"date": tomorrow})
    assert r.json()["entry"] is None
    _as("admin")
    r = await admin_client.get("/api/v1/daily-text", params={"date": tomorrow})
    assert r.json()["entry"]["headline"] == "Planned"


async def test_only_admin_writes_and_headline_required(admin_client):
    today = today_ist().isoformat()
    for role in ("leader", "team"):
        _as(role)
        assert (await admin_client.put(f"/api/v1/daily-text/{today}", json={"headline": "x"})).status_code == 403
        assert (await admin_client.delete(f"/api/v1/daily-text/{today}")).status_code == 403
    _as("admin")
    assert (await admin_client.put(f"/api/v1/daily-text/{today}", json={"headline": "   "})).status_code == 422
