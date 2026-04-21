from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.daily_report import DailyReport
from app.models.daily_score import DailyScore
from app.models.lead import Lead
from app.models.wallet_ledger import WalletLedgerEntry
from main import app

from conftest import get_test_session_factory
from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


async def _reset_analytics_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(WalletLedgerEntry))
        await session.execute(delete(DailyScore))
        await session.execute(delete(DailyReport))
        await session.execute(delete(Lead))
        await session.commit()


async def _seed_analytics_tables() -> None:
    factory = get_test_session_factory()
    today = date.today()
    now = datetime.now(timezone.utc)
    async with factory() as session:
        session.add_all(
            [
                DailyReport(
                    user_id=2,
                    report_date=today,
                    total_calling=12,
                    calls_picked=6,
                    enrollments_done=1,
                    payments_actual=1,
                ),
                DailyReport(
                    user_id=3,
                    report_date=today,
                    total_calling=8,
                    calls_picked=4,
                    enrollments_done=2,
                    payments_actual=1,
                ),
                DailyScore(user_id=2, score_date=today, points=50),
                DailyScore(user_id=3, score_date=today, points=30),
                Lead(
                    name="Leader lead",
                    status="converted",
                    created_by_user_id=2,
                    assigned_to_user_id=2,
                    phone="9777777771",
                    created_at=now,
                ),
                Lead(
                    name="Team lead",
                    status="paid",
                    created_by_user_id=3,
                    assigned_to_user_id=3,
                    phone="9777777772",
                    created_at=now,
                ),
                WalletLedgerEntry(
                    user_id=2,
                    amount_cents=20_000,
                    currency="INR",
                    idempotency_key="analytics-credit",
                    created_by_user_id=1,
                ),
                WalletLedgerEntry(
                    user_id=3,
                    amount_cents=-5_000,
                    currency="INR",
                    idempotency_key="analytics-debit",
                    created_by_user_id=1,
                ),
            ]
        )
        await session.commit()


def test_analytics_activity_log_requires_auth() -> None:
    assert client.get("/api/v1/analytics/activity-log").status_code == 401


def test_analytics_activity_log_admin_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    r = c.get("/api/v1/analytics/activity-log")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["note"]


def test_analytics_activity_log_forbidden_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/analytics/activity-log").status_code == 403


def test_analytics_day_2_report_removed(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/analytics/day-2-report").status_code == 404


def test_analytics_export_csv_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.post("/api/v1/analytics/export?format=csv&days=7")
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "analytics-7days.csv" in (r.headers.get("content-disposition") or "")
    assert b"Analytics Export" in r.content


def test_analytics_export_excel_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.post("/api/v1/analytics/export?format=excel&days=7")
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers.get("content-type", "")
    assert ".xlsx" in (r.headers.get("content-disposition") or "")
    assert r.content[:2] == b"PK"  # ZIP / OOXML


def test_analytics_team_performance_includes_leader_and_downline(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_analytics_tables())
    try:
        asyncio.run(_seed_analytics_tables())
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        r = c.get("/api/v1/analytics/team-performance?days=7")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["team_size"] == 2
        assert body["reports"]["total_calls"] == 20
        assert body["scores"]["total_points"] == 80
        assert body["leads"]["total_leads"] == 2
    finally:
        asyncio.run(_reset_analytics_tables())


def test_analytics_system_overview_wallet_totals(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_analytics_tables())
    try:
        asyncio.run(_seed_analytics_tables())
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        r = c.get("/api/v1/analytics/system-overview?days=7")
        assert r.status_code == 200, r.text
        wallet = r.json()["wallet"]
        assert wallet["total_credits"] == 20_000
        assert wallet["total_debits"] == 5_000
        assert wallet["net_volume"] == 15_000
    finally:
        asyncio.run(_reset_analytics_tables())
