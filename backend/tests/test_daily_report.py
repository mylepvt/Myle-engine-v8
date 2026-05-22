"""Tests for daily report endpoints.

Covers:
- POST /api/v1/daily   (submit / upsert daily report)
- GET  /api/v1/daily/mine (fetch saved report)
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

SUBMIT_URL = "/api/v1/reports/daily"
GET_URL = "/api/v1/reports/daily/mine"


def _today_iso() -> str:
    """Today's date in IST as YYYY-MM-DD (admin users bypass IST lock)."""
    from app.services.team_reports_metrics import IST
    return datetime.now(IST).date().isoformat()


def _base_payload(report_date: str | None = None) -> dict:
    return {
        "report_date": report_date or _today_iso(),
        "total_calling": 50,
        "calls_picked": 12,
        "wrong_numbers": 3,
        "day1_count": 5,
        "day2_count": 3,
        "day3_count": 1,
        "underage": 0,
        "plan_2cc": 2,
        "seat_holdings": 1,
        "leads_educated": 4,
        "pdf_covered": 2,
        "calls_made_actual": 48,
        "payments_actual": 1,
        "remarks": "Good day, closed one.",
    }


# ── GET before submit ─────────────────────────────────────────────────────────

async def test_get_report_not_yet_submitted(admin_client: AsyncClient):
    """No report for an arbitrary past date → 200 with null body."""
    resp = await admin_client.get(GET_URL, params={"report_date": "2000-01-01"})
    assert resp.status_code == 200
    assert resp.json() is None


# ── POST — submit ─────────────────────────────────────────────────────────────

async def test_submit_report_admin(admin_client: AsyncClient):
    """Admin submits a daily report → 201 with the saved data."""
    today = _today_iso()
    resp = await admin_client.post(SUBMIT_URL, json=_base_payload(today))
    assert resp.status_code == 201
    body = resp.json()
    assert body["report_date"] == today
    assert body["total_calling"] == 50
    assert body["user_id"] == 203  # admin user_id from fixture


async def test_submit_report_team_today(team_client: AsyncClient):
    """Team member submits today's report → 201."""
    today = _today_iso()
    resp = await team_client.post(SUBMIT_URL, json=_base_payload(today))
    assert resp.status_code == 201
    body = resp.json()
    assert body["report_date"] == today
    assert body["user_id"] == 201  # team user_id from fixture


async def test_submit_report_team_future_date_rejected(team_client: AsyncClient):
    """Non-admin submitting a future date → 400."""
    resp = await team_client.post(SUBMIT_URL, json=_base_payload("2099-12-31"))
    assert resp.status_code == 400


async def test_submit_report_team_past_date_rejected(team_client: AsyncClient):
    """Non-admin submitting a past date → 400."""
    resp = await team_client.post(SUBMIT_URL, json=_base_payload("2020-01-01"))
    assert resp.status_code == 400


# ── GET after submit ──────────────────────────────────────────────────────────

async def test_get_report_after_submit(leader_client: AsyncClient):
    """Submit then GET — returns the saved report."""
    today = _today_iso()
    payload = _base_payload(today)
    payload["total_calling"] = 77
    payload["remarks"] = "Leader test submission"

    post_resp = await leader_client.post(SUBMIT_URL, json=payload)
    assert post_resp.status_code == 201

    get_resp = await leader_client.get(GET_URL, params={"report_date": today})
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body is not None
    assert body["total_calling"] == 77
    assert body["user_id"] == 202  # leader user_id


# ── POST — re-submit updates fields ──────────────────────────────────────────

async def test_resubmit_updates_report(admin_client: AsyncClient):
    """Submitting again for the same date updates the record (upsert)."""
    today = _today_iso()

    first = _base_payload(today)
    first["total_calling"] = 10
    first["remarks"] = "first version"
    r1 = await admin_client.post(SUBMIT_URL, json=first)
    assert r1.status_code == 201

    second = _base_payload(today)
    second["total_calling"] = 99
    second["remarks"] = "updated version"
    r2 = await admin_client.post(SUBMIT_URL, json=second)
    assert r2.status_code == 201
    body = r2.json()
    assert body["total_calling"] == 99
    assert body["remarks"] == "updated version"


# ── Validation ────────────────────────────────────────────────────────────────

async def test_submit_missing_required_field(admin_client: AsyncClient):
    """Payload missing report_date → 422 Unprocessable Entity."""
    payload = _base_payload()
    del payload["report_date"]
    resp = await admin_client.post(SUBMIT_URL, json=payload)
    assert resp.status_code == 422


async def test_submit_invalid_date_format(admin_client: AsyncClient):
    """Malformed date string → 422."""
    payload = _base_payload()
    payload["report_date"] = "not-a-date"
    resp = await admin_client.post(SUBMIT_URL, json=payload)
    assert resp.status_code == 422
