"""Legacy-aligned surfaces: leaderboard filters, live-session keys, budget hierarchy export."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from conftest import get_test_session_factory
from main import app
from util_jwt_patch import patch_jwt_settings


def _client_role(monkeypatch: pytest.MonkeyPatch, role: str) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return c


async def _reset_budget_state() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(Lead))
        await session.execute(delete(WalletRecharge))
        await session.execute(delete(WalletLedgerEntry))
        await session.commit()


@pytest.fixture(autouse=True)
def _clean_budget_state() -> None:
    asyncio.run(_reset_budget_state())
    yield
    asyncio.run(_reset_budget_state())


async def _seed_budget_hierarchy() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        admin = await session.get(User, 1)
        leader = await session.get(User, 2)
        team = await session.get(User, 3)
        assert admin is not None and leader is not None and team is not None

        admin.name = "Admin Budget"
        leader.name = "Leader Budget"
        leader.phone = "9000000002"
        team.name = "Team Budget"
        team.phone = "9000000003"

        session.add_all(
            [
                WalletLedgerEntry(
                    user_id=2,
                    amount_cents=20000,
                    idempotency_key="recharge_2001",
                    note="Recharge approved #2001",
                    created_by_user_id=1,
                    created_at=datetime(2026, 4, 8, 11, 30, tzinfo=timezone.utc),
                ),
                WalletLedgerEntry(
                    user_id=2,
                    amount_cents=1500,
                    idempotency_key="leader-adjustment-2002",
                    note="Leader opening adjustment",
                    created_by_user_id=1,
                    created_at=datetime(2026, 4, 9, 10, 15, tzinfo=timezone.utc),
                ),
                WalletLedgerEntry(
                    user_id=3,
                    amount_cents=5000,
                    idempotency_key="recharge_3001",
                    note="Recharge approved #3001",
                    created_by_user_id=1,
                    created_at=datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc),
                ),
                WalletLedgerEntry(
                    user_id=3,
                    amount_cents=-1200,
                    idempotency_key="pool_claim_91_3",
                    note="Lead pool claim",
                    created_by_user_id=1,
                    created_at=datetime(2026, 4, 11, 13, 45, tzinfo=timezone.utc),
                ),
                WalletLedgerEntry(
                    user_id=3,
                    amount_cents=-300,
                    idempotency_key="team-adjustment-3002",
                    note="Manual correction",
                    created_by_user_id=1,
                    created_at=datetime(2026, 4, 12, 16, 20, tzinfo=timezone.utc),
                ),
                Lead(
                    name="Leader Budget Lead",
                    created_by_user_id=1,
                    owner_user_id=2,
                    assigned_to_user_id=2,
                    status="fresh_lead",
                ),
                Lead(
                    name="Team Budget Lead 1",
                    created_by_user_id=1,
                    owner_user_id=3,
                    assigned_to_user_id=3,
                    status="fresh_lead",
                ),
                Lead(
                    name="Team Budget Lead 2",
                    created_by_user_id=1,
                    owner_user_id=3,
                    assigned_to_user_id=3,
                    status="follow_up",
                ),
            ]
        )
        await session.commit()


def test_other_leaderboard_ok_and_note(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    r = c.get("/api/v1/other/leaderboard")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert "daily_scores" in (body.get("note") or "")


def test_other_live_session_zoom_legacy_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """When only legacy Flask keys exist, API still returns a joinable URL."""
    admin = _client_role(monkeypatch, "admin")
    r = admin.get("/api/v1/other/live-session")
    assert r.status_code == 200
    body = r.json()
    assert body.get("total") in (0, 1)
    assert "zoom" in (body.get("note") or "").lower() or "live_session" in (body.get("note") or "").lower()


def test_premiere_schedule_survives_missing_viewer_table(monkeypatch: pytest.MonkeyPatch) -> None:
    team = _client_role(monkeypatch, "team")
    r = team.get("/api/v1/other/premiere/schedule")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["slots"], list)
    assert len(body["slots"]) >= 1
    assert all(slot["viewer_count_today"] == 0 for slot in body["slots"])


def test_premiere_register_survives_missing_viewer_table() -> None:
    c = TestClient(app)
    r = c.post(
        "/api/v1/other/premiere/register",
        json={
            "viewer_id": "viewer-missing-table",
            "name": "Prospect",
            "city": "Delhi",
            "phone": "9999999999",
            "session_hour": 11,
            "state": "waiting",
        },
    )
    assert r.status_code == 201
    assert r.json() == {"ok": False, "tracking_disabled": True}


def test_finance_budget_export_admin_returns_hierarchy(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_seed_budget_hierarchy())

    admin = _client_role(monkeypatch, "admin")
    r = admin.get(
        "/api/v1/finance/budget-export",
        params={"period": "custom", "date_from": "2026-04-01", "date_to": "2026-04-30"},
    )
    assert r.status_code == 200
    body = r.json()

    assert body["period"] == "custom"
    assert body["date_from"] == "2026-04-01"
    assert body["date_to"] == "2026-04-30"
    assert body["selected_leader_user_id"] is None
    assert body["selected_member_user_id"] is None
    assert "Hierarchy budget view" in (body.get("note") or "")

    assert body["filter_options"]["leaders"] == [
        {
            "user_id": 2,
            "label": "Leader Budget",
            "role": "leader",
            "fbo_id": "fbo-leader-001",
            "leader_user_id": 2,
            "leader_name": "Leader Budget",
        }
    ]
    assert body["filter_options"]["members"] == [
        {
            "user_id": 3,
            "label": "Team Budget",
            "role": "team",
            "fbo_id": "fbo-team-001",
            "leader_user_id": 2,
            "leader_name": "Leader Budget",
        }
    ]

    assert body["grand_totals"] == {
        "total_visible_users": 2,
        "total_visible_leaders": 1,
        "total_visible_team_members": 1,
        "current_balance_cents": 25000,
        "team_balance_cents": 3500,
        "leader_personal_balance_cents": 21500,
        "period_recharge_cents": 25000,
        "period_spend_cents": 1200,
        "period_adjustment_cents": 1200,
        "period_net_change_cents": 25000,
    }

    assert body["total"] == 2
    assert len(body["leaders"]) == 1
    assert body["unlinked_members"] == []

    group = body["leaders"][0]
    assert group["leader"]["display_name"] == "Leader Budget"
    assert group["leader"]["current_balance_cents"] == 21500
    assert group["leader"]["active_leads_count"] == 1
    assert group["team_member_count"] == 1
    assert group["team_balance_cents"] == 3500
    assert group["team_recharge_cents"] == 5000
    assert group["team_spend_cents"] == 1200
    assert group["team_adjustment_cents"] == -300
    assert group["team_net_change_cents"] == 3500
    assert group["combined_balance_cents"] == 25000
    assert group["combined_period_net_change_cents"] == 25000

    member = group["members"][0]
    assert member["display_name"] == "Team Budget"
    assert member["leader_name"] == "Leader Budget"
    assert member["period_recharge_cents"] == 5000
    assert member["period_spend_cents"] == 1200
    assert member["period_adjustment_cents"] == -300
    assert member["period_net_change_cents"] == 3500
    assert member["active_leads_count"] == 2


def test_finance_budget_export_can_filter_to_leader_and_member(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_seed_budget_hierarchy())

    admin = _client_role(monkeypatch, "admin")
    r = admin.get(
        "/api/v1/finance/budget-export",
        params={
            "period": "custom",
            "date_from": "2026-04-01",
            "date_to": "2026-04-30",
            "leader_user_id": 2,
            "member_user_id": 3,
        },
    )
    assert r.status_code == 200
    body = r.json()

    assert body["selected_leader_user_id"] == 2
    assert body["selected_member_user_id"] == 3
    assert body["grand_totals"]["total_visible_users"] == 2
    assert len(body["leaders"]) == 1
    assert body["leaders"][0]["leader"]["user_id"] == 2
    assert [member["user_id"] for member in body["leaders"][0]["members"]] == [3]
    assert body["unlinked_members"] == []


def test_finance_budget_export_history_returns_budget_movement(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_seed_budget_hierarchy())

    admin = _client_role(monkeypatch, "admin")
    r = admin.get(
        "/api/v1/finance/budget-export/history",
        params={"user_id": 3, "period": "custom", "date_from": "2026-04-01", "date_to": "2026-04-30"},
    )
    assert r.status_code == 200
    body = r.json()

    assert body["subject"]["display_name"] == "Team Budget"
    assert body["subject"]["leader_name"] == "Leader Budget"
    assert body["subject"]["current_balance_cents"] == 3500
    assert body["total"] == 3
    assert [entry["kind"] for entry in body["history"]] == ["adjustment", "spend", "recharge"]
    assert [entry["direction"] for entry in body["history"]] == ["debit", "debit", "credit"]
    assert [entry["amount_cents"] for entry in body["history"]] == [-300, -1200, 5000]
    assert all(entry["created_by_name"] == "Admin Budget" for entry in body["history"])
    assert "Team Budget" in (body.get("note") or "")


def test_finance_budget_export_team_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    assert c.get("/api/v1/finance/budget-export").status_code == 403
