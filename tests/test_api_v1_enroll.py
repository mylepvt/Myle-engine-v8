from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.models.app_setting import AppSetting
from app.models.crm_outbox import CrmOutbox
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from main import app
from util_jwt_patch import patch_jwt_settings


async def _clear_state() -> None:
    factory = test_conftest.get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(EnrollShareLink))
        await session.execute(delete(AppSetting))
        await session.execute(delete(Lead))
        await session.commit()


async def _seed_lead(
    *,
    name: str = "Enrollment Lead",
    phone: str = "9876543210",
    status: str = "invited",
    created_by_user_id: int = 2,
    assigned_to_user_id: int = 2,
) -> None:
    factory = test_conftest.get_test_session_factory()
    async with factory() as session:
        session.add(
            Lead(
                name=name,
                phone=phone,
                status=status,
                created_by_user_id=created_by_user_id,
                assigned_to_user_id=assigned_to_user_id,
            )
        )
        await session.commit()


async def _set_app_setting(key: str, value: str) -> None:
    factory = test_conftest.get_test_session_factory()
    async with factory() as session:
        session.add(AppSetting(key=key, value=value))
        await session.commit()


def _authed(role: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    client = TestClient(app)
    assert client.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return client


def _error_message(body: dict) -> str:
    detail = body.get("detail")
    if isinstance(detail, str):
        return detail
    error = body.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return str(error["message"])
    return str(body)


def test_send_enrollment_video_creates_secure_link_without_starting_expiry_until_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_clear_state())
    asyncio.run(_seed_lead())
    asyncio.run(_set_app_setting("enrollment_video_source_url", "https://cdn.example.com/private/enrollment.mp4"))
    asyncio.run(_set_app_setting("enrollment_video_title", "Private Enrollment Brief"))

    try:
        client = _authed("leader", monkeypatch)
        res = client.post("/api/v1/enroll/send", json={"lead_id": 1})
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["link"]["share_url"].startswith("/watch/")
        assert body["link"]["title"] == "Private Enrollment Brief"
        assert body["delivery"]["channel"] == "whatsapp_stub"
        assert "wa.me" in (body["delivery"]["manual_share_url"] or "")

        assert body["link"]["expires_at"] is None

        async def _assert_db() -> None:
            factory = test_conftest.get_test_session_factory()
            async with factory() as session:
                lead = await session.get(Lead, 1)
                assert lead is not None
                assert lead.status == "video_sent"
                assert lead.call_status == "not_called"
                assert lead.whatsapp_sent_at is not None
                link = (await session.execute(select(EnrollShareLink))).scalar_one()
                assert link.youtube_url == "https://cdn.example.com/private/enrollment.mp4"
                assert link.expires_at is None

        asyncio.run(_assert_db())
    finally:
        asyncio.run(_clear_state())


def test_watch_link_requires_matching_phone_and_marks_completion_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_clear_state())
    asyncio.run(_seed_lead(name="Priya Sharma", phone="+91 98765 43210"))
    asyncio.run(_set_app_setting("enrollment_video_source_url", "https://cdn.example.com/private/enrollment.mp4"))

    try:
        client = _authed("leader", monkeypatch)
        send_res = client.post("/api/v1/enroll/send", json={"lead_id": 1})
        assert send_res.status_code == 201, send_res.text
        token = send_res.json()["link"]["token"]

        initial = client.get(f"/api/v1/watch/{token}")
        assert initial.status_code == 200
        assert initial.json()["access_granted"] is False
        assert initial.json()["masked_phone"].endswith("210")
        expires_at = datetime.fromisoformat(initial.json()["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        assert timedelta(minutes=49) <= (expires_at - datetime.now(timezone.utc)) <= timedelta(minutes=51)

        wrong = client.post(f"/api/v1/watch/{token}/unlock", json={"phone": "9999999999"})
        assert wrong.status_code == 403

        unlocked = client.post(f"/api/v1/watch/{token}/unlock", json={"phone": "9876543210"})
        assert unlocked.status_code == 200, unlocked.text
        assert unlocked.json()["access_granted"] is True
        assert unlocked.json()["stream_url"] == f"/api/v1/watch/{token}/stream"

        played = client.post(f"/api/v1/watch/{token}/play")
        assert played.status_code == 200, played.text
        assert played.json()["watch_started"] is True
        completed = client.post(f"/api/v1/watch/{token}/complete")
        assert completed.status_code == 200, completed.text
        assert completed.json()["watch_completed"] is True

        async def _assert_db() -> None:
            factory = test_conftest.get_test_session_factory()
            async with factory() as session:
                lead = await session.get(Lead, 1)
                assert lead is not None
                assert lead.status == "video_sent"
                assert lead.call_status == "not_called"
                assert lead.last_action_at is not None
                link = (await session.execute(select(EnrollShareLink))).scalar_one()
                assert link.status_synced is True
                assert link.first_viewed_at is not None
                assert link.view_count == 1

        asyncio.run(_assert_db())
    finally:
        asyncio.run(_clear_state())


def test_watch_link_expires_after_fifty_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_state())
    asyncio.run(_seed_lead())
    asyncio.run(_set_app_setting("enrollment_video_source_url", "https://cdn.example.com/private/enrollment.mp4"))

    try:
        client = _authed("leader", monkeypatch)
        send_res = client.post("/api/v1/enroll/send", json={"lead_id": 1})
        assert send_res.status_code == 201, send_res.text
        token = send_res.json()["link"]["token"]
        initial = client.get(f"/api/v1/watch/{token}")
        assert initial.status_code == 200

        async def _expire() -> None:
            factory = test_conftest.get_test_session_factory()
            async with factory() as session:
                link = (await session.execute(select(EnrollShareLink))).scalar_one()
                link.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
                await session.commit()

        asyncio.run(_expire())

        expired = client.get(f"/api/v1/watch/{token}")
        assert expired.status_code == 410
    finally:
        asyncio.run(_clear_state())


def test_send_enrollment_video_rejects_youtube_source(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_state())
    asyncio.run(_seed_lead())
    asyncio.run(_set_app_setting("enrollment_video_source_url", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"))

    try:
        client = _authed("leader", monkeypatch)
        res = client.post("/api/v1/enroll/send", json={"lead_id": 1})
        assert res.status_code == 400
        assert "direct hosted video" in _error_message(res.json()).lower()
    finally:
        asyncio.run(_clear_state())
