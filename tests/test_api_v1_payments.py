from __future__ import annotations

import asyncio

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.activity_log import ActivityLog
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


async def _clear_payment_state() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
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
    asyncio.run(_seed_payment_lead())

    try:
        team = TestClient(app)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200

        upload = team.post(
            "/api/v1/payments/proof/upload",
            files={"proof_file": ("proof.png", _PNG_BYTES, "image/png")},
            data={
                "lead_id": "1",
                "payment_amount_cents": "19600",
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
    finally:
        asyncio.run(_clear_payment_state())
