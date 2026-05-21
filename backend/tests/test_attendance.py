"""Tests for attendance check-in/out endpoints.

Covers:
- POST /api/v1/checkin          (check in — creates new session)
- POST /api/v1/checkin/out      (check out — closes active session)
- POST /api/v1/checkin/heartbeat (activity ping — updates last_active_at)
- GET  /api/v1/checkin/today    (my status for today)
- GET  /api/v1/checkin/team     (team view — leader/admin only)

Uses team_client (user_id=201), leader_client (user_id=202), admin_client (user_id=203).
Each module uses distinct user_ids so shared SQLite DB has no cross-test conflicts.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

CHECKIN_URL = "/api/v1/checkin"
CHECKOUT_URL = "/api/v1/checkin/out"
HEARTBEAT_URL = "/api/v1/checkin/heartbeat"
TODAY_URL = "/api/v1/checkin/today"
TEAM_URL = "/api/v1/checkin/team"


# ── GET today — before any check-in ──────────────────────────────────────────

async def test_get_today_not_checked_in(team_client: AsyncClient):
    """No session yet → checked_in=False."""
    resp = await team_client.get(TODAY_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_in"] is False
    assert body["sessions_today"] == 0


# ── POST check-in ─────────────────────────────────────────────────────────────

async def test_checkin_creates_session(team_client: AsyncClient):
    """First check-in of the day → creates a session, checked_in=True."""
    resp = await team_client.post(CHECKIN_URL, json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_in"] is True
    assert body["already"] is False
    assert body["check_in_at"] is not None
    assert body["check_out_at"] is None
    assert body["status"] in ("active", "away")


async def test_checkin_twice_returns_already(team_client: AsyncClient):
    """Checking in while an active session exists → already=True, no duplicate row."""
    resp = await team_client.post(CHECKIN_URL, json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_in"] is True
    assert body["already"] is True


async def test_get_today_after_checkin(team_client: AsyncClient):
    """GET /today after check-in → checked_in=True, at least 1 session."""
    resp = await team_client.get(TODAY_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_in"] is True
    assert body["sessions_today"] >= 1


# ── GPS / location fields ─────────────────────────────────────────────────────

async def test_checkin_with_gps_coordinates(leader_client: AsyncClient):
    """Coordinates within accuracy threshold → is_suspicious=False."""
    payload = {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "accuracy_meters": 45.0,
        "city": "New Delhi",
        "state": "Delhi",
    }
    resp = await leader_client.post(CHECKIN_URL, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_suspicious"] is False
    assert body["city"] == "New Delhi"
    assert body["state"] == "Delhi"


async def test_checkin_poor_gps_flagged_suspicious(admin_client: AsyncClient):
    """Accuracy > 500m → is_suspicious=True."""
    payload = {
        "latitude": 19.0760,
        "longitude": 72.8777,
        "accuracy_meters": 1500.0,
    }
    resp = await admin_client.post(CHECKIN_URL, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_suspicious"] is True


# ── POST check-out ────────────────────────────────────────────────────────────

async def test_checkout_closes_active_session(team_client: AsyncClient):
    """Check out after active session → check_out_at set, duration computed."""
    resp = await team_client.post(CHECKOUT_URL, json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["check_out_at"] is not None
    assert body["work_duration_minutes"] is not None
    assert body["work_duration_minutes"] >= 0
    assert body.get("checked_out") is True


async def test_checkout_no_active_session(leader_client: AsyncClient):
    """Check out after already checked out → 400 (no open session)."""
    # first check out leader (who checked in above)
    await leader_client.post(CHECKOUT_URL, json={})
    # second checkout → no active session
    resp = await leader_client.post(CHECKOUT_URL, json={})
    assert resp.status_code == 400


# ── Multiple sessions per day ─────────────────────────────────────────────────

async def test_checkin_again_after_checkout_creates_new_session(team_client: AsyncClient):
    """Check in after checkout → new session created (sessions_today increments)."""
    # current state: team user is checked out from previous tests
    before = await team_client.get(TODAY_URL)
    sessions_before = before.json().get("sessions_today", 0)

    resp = await team_client.post(CHECKIN_URL, json={"city": "Mumbai", "state": "Maharashtra"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_in"] is True
    assert body["already"] is False  # new session, not "already"

    after = await team_client.get(TODAY_URL)
    sessions_after = after.json().get("sessions_today", 0)
    assert sessions_after > sessions_before


# ── Heartbeat ────────────────────────────────────────────────────────────────

async def test_heartbeat_while_active(team_client: AsyncClient):
    """Heartbeat while checked in → 200 ok."""
    resp = await team_client.post(HEARTBEAT_URL)
    assert resp.status_code == 200
    assert resp.json()["ok"] == "1"


async def test_heartbeat_no_active_session(leader_client: AsyncClient):
    """Heartbeat when no active session (already checked out) → still 200 (no-op)."""
    # leader is checked out from test_checkout_no_active_session
    resp = await leader_client.post(HEARTBEAT_URL)
    assert resp.status_code == 200
    assert resp.json()["ok"] == "1"


# ── Team view ─────────────────────────────────────────────────────────────────

async def test_team_view_forbidden_for_team_role(team_client: AsyncClient):
    """Team member cannot view team attendance → 403."""
    resp = await team_client.get(TEAM_URL)
    assert resp.status_code == 403


async def test_team_view_ok_for_leader(leader_client: AsyncClient):
    """Leader can view team attendance → 200 with summary fields."""
    resp = await leader_client.get(TEAM_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert "date" in body
    assert "total" in body
    assert "checked_in" in body
    assert "active" in body
    assert isinstance(body["items"], list)


async def test_team_view_ok_for_admin(admin_client: AsyncClient):
    """Admin can view all-team attendance → 200."""
    resp = await admin_client.get(TEAM_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body


async def test_team_view_custom_date(admin_client: AsyncClient):
    """Admin requests a specific past date → returns empty items (no data for 2020-01-01)."""
    resp = await admin_client.get(TEAM_URL, params={"date": "2020-01-01"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["date"] == "2020-01-01"
    assert body["total"] == 0  # no users scoped for this admin in test DB


async def test_team_view_invalid_date(admin_client: AsyncClient):
    """Invalid date format → 422."""
    resp = await admin_client.get(TEAM_URL, params={"date": "not-a-date"})
    assert resp.status_code == 422
