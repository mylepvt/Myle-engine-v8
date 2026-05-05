from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.activity_log import ActivityLog
from app.models.crm_outbox import CrmOutbox
from app.models.lead import Lead
from app.services import payment_proof_storage
from main import app

from util_jwt_patch import patch_jwt_settings


_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
    b"\xe2!\xbc3"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _seed_payment_lead() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            Lead(
                name="Payment Proof Lead",
                status="video_watched",
                created_by_user_id=3,
                assigned_to_user_id=3,
                phone="9999999999",
                source="facebook",
            )
        )
        await session.commit()


async def _seed_unassigned_payment_lead() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            Lead(
                name="Unassigned Payment Lead",
                status="video_watched",
                created_by_user_id=3,
                assigned_to_user_id=None,
                phone="7777777777",
                source="facebook",
            )
        )
        await session.commit()


async def _clear_payment_state() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(ActivityLog))
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(Lead))
        await session.commit()


async def _age_mindset_start(*, lead_id: int, minutes_ago: int) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        lead = await session.get(Lead, lead_id)
        assert lead is not None
        lead.mindset_started_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        await session.commit()


async def _seed_payment_history_lead(*, reviewed_at: datetime) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        lead = Lead(
            name="History Lead",
            status="paid",
            created_by_user_id=3,
            assigned_to_user_id=3,
            phone="8888888888",
            source="facebook",
            payment_status="approved",
            payment_amount_cents=19600,
            payment_proof_url="https://example.com/proof.png",
            payment_proof_uploaded_at=reviewed_at,
        )
        session.add(lead)
        await session.flush()
        session.add(
            ActivityLog(
                user_id=1,
                action="payment_proof_approved",
                entity_type="lead",
                entity_id=lead.id,
                meta={"notes": "Looks good"},
                created_at=reviewed_at,
            )
        )
        await session.commit()


def test_public_payment_proof_upload_reaches_admin_queue(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    patched_settings = patch_jwt_settings(
        monkeypatch,
        auth_dev_login_enabled=True,
        upload_dir=str(tmp_path),
    )
    monkeypatch.setattr(payment_proof_storage, "settings", patched_settings)
    asyncio.run(_clear_payment_state())
    asyncio.run(_seed_payment_lead())

    try:
        team = TestClient(app)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200

        upload = team.post(
            "/api/v1/payments/proof/upload",
            files={"proof_file": ("proof.png", _PNG_BYTES, "image/png")},
            data={
                "lead_id": "1",
                "payment_amount_cents": "150000",
                "notes": "proof",
            },
        )
        assert upload.status_code == 200
        assert upload.json()["payment_status"] == "proof_uploaded"

        admin = TestClient(app)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200

        queue = admin.get("/api/v1/team/enrollment-requests")
        assert queue.status_code == 200
        body = queue.json()
        assert body["total"] == 1
        assert body["items"][0]["lead_id"] == 1
        assert body["items"][0]["status"] == "proof_uploaded"

        approve = admin.post("/api/v1/team/enrollment-requests/1/decision", json={"action": "approve"})
        assert approve.status_code == 200
        assert approve.json()["payment_status"] == "approved"

        lead = team.get("/api/v1/leads/1")
        assert lead.status_code == 200
        lead_body = lead.json()
        assert lead_body["status"] == "paid"
        assert lead_body["payment_status"] == "approved"
        assert lead_body["last_action_at"] is not None
    finally:
        asyncio.run(_clear_payment_state())


def test_payment_approval_restores_missing_assignee_for_workboard_route(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    patched_settings = patch_jwt_settings(
        monkeypatch,
        auth_dev_login_enabled=True,
        upload_dir=str(tmp_path),
    )
    monkeypatch.setattr(payment_proof_storage, "settings", patched_settings)
    asyncio.run(_clear_payment_state())
    asyncio.run(_seed_unassigned_payment_lead())

    try:
        team = TestClient(app)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200

        upload = team.post(
            "/api/v1/payments/proof/upload",
            files={"proof_file": ("proof.png", _PNG_BYTES, "image/png")},
            data={
                "lead_id": "1",
                "payment_amount_cents": "150000",
                "notes": "proof",
            },
        )
        assert upload.status_code == 200
        assert upload.json()["payment_status"] == "proof_uploaded"

        admin = TestClient(app)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200

        approve = admin.post("/api/v1/team/enrollment-requests/1/decision", json={"action": "approve"})
        assert approve.status_code == 200
        assert approve.json()["payment_status"] == "approved"

        lead = team.get("/api/v1/leads/1")
        assert lead.status_code == 200
        lead_body = lead.json()
        assert lead_body["status"] == "paid"
        assert lead_body["payment_status"] == "approved"
        assert lead_body["assigned_to_user_id"] == 3
    finally:
        asyncio.run(_clear_payment_state())


def test_enrollment_history_returns_calendar_wise_payment_decisions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    asyncio.run(_clear_payment_state())
    reviewed_at = datetime(2026, 4, 21, 4, 30, tzinfo=timezone.utc)
    asyncio.run(_seed_payment_history_lead(reviewed_at=reviewed_at))

    try:
        admin = TestClient(app)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200

        history = admin.get(
            "/api/v1/team/enrollment-requests/history",
            params={"date": "2026-04-21"},
        )
        assert history.status_code == 200
        body = history.json()
        assert body["date"] == "2026-04-21"
        assert body["total"] == 1
        item = body["items"][0]
        assert item["lead_name"] == "History Lead"
        assert item["review_action"] == "approved"
        assert item["review_note"] == "Looks good"
        assert item["payment_proof_url"] == "https://example.com/proof.png"
        assert item["reviewed_by_user_id"] == 1
        assert item["reviewed_at"].startswith("2026-04-21T04:30:00")
    finally:
        asyncio.run(_clear_payment_state())


def test_flp_min_billing_flow_keeps_paid_to_mindset_to_day2_to_day3_intact(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    patched_settings = patch_jwt_settings(
        monkeypatch,
        auth_dev_login_enabled=True,
        upload_dir=str(tmp_path),
    )
    monkeypatch.setattr(payment_proof_storage, "settings", patched_settings)
    asyncio.run(_clear_payment_state())
    asyncio.run(_seed_payment_lead())

    try:
        team = TestClient(app)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200

        upload = team.post(
            "/api/v1/payments/proof/upload",
            files={"proof_file": ("proof.png", _PNG_BYTES, "image/png")},
            data={
                "lead_id": "1",
                "payment_amount_cents": "150000",
                "notes": "proof",
            },
        )
        assert upload.status_code == 200

        admin = TestClient(app)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        approve = admin.post("/api/v1/team/enrollment-requests/1/decision", json={"action": "approve"})
        assert approve.status_code == 200

        paid = team.get("/api/v1/leads/1")
        assert paid.status_code == 200
        assert paid.json()["status"] == "paid"

        mindset = team.patch("/api/v1/leads/1", json={"status": "mindset_lock"})
        assert mindset.status_code == 200, mindset.text
        assert mindset.json()["status"] == "mindset_lock"

        asyncio.run(_age_mindset_start(lead_id=1, minutes_ago=6))

        handoff = team.post("/api/v1/leads/1/mindset-lock-complete")
        assert handoff.status_code == 200, handoff.text

        leader = TestClient(app)
        assert leader.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        day1 = leader.get("/api/v1/leads/1")
        assert day1.status_code == 200
        assert day1.json()["status"] == "day1"

        day2 = leader.post("/api/v1/leads/1/transition", json={"target_status": "day2"})
        assert day2.status_code == 200, day2.text
        assert day2.json()["new_status"] == "day2"

        day3 = leader.post("/api/v1/leads/1/transition", json={"target_status": "day3"})
        assert day3.status_code == 200, day3.text
        assert day3.json()["new_status"] == "day3"
    finally:
        asyncio.run(_clear_payment_state())
