from __future__ import annotations

import asyncio

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.models.app_setting import AppSetting
from app.models.member_removal_outreach import MemberRemovalOutreach
from app.models.user import User
from app.models.whatsapp_log import WhatsAppLog
from main import app
from util_jwt_patch import patch_jwt_settings


async def _reset_tables() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(WhatsAppLog))
        await session.execute(delete(MemberRemovalOutreach))
        await session.execute(delete(AppSetting).where(AppSetting.key == "whatsapp.meta.verify_token"))
        await session.commit()


async def _seed_verify_token(value: str) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(AppSetting(key="whatsapp.meta.verify_token", value=value))
        await session.commit()


async def _seed_removal_outreach(phone: str = "9876500000") -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            MemberRemovalOutreach(
                user_id=3,
                phone=phone,
                member_name="Team Member",
                send_status="sent",
            )
        )
        await session.commit()


async def _seed_leader_phone(phone: str = "9876501111") -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        leader = await session.get(User, 2)
        assert leader is not None
        leader.phone = phone
        await session.commit()


def _admin_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    client = TestClient(app)
    assert client.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    return client


def test_meta_webhook_verify_reads_app_setting_token() -> None:
    asyncio.run(_reset_tables())
    try:
        asyncio.run(_seed_verify_token("secret-verify-token"))
        client = TestClient(app)
        res = client.get(
            "/api/v1/webhooks/whatsapp/reply",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "secret-verify-token",
                "hub.challenge": "12345",
            },
        )
        assert res.status_code == 200
        assert res.text == "12345"
    finally:
        asyncio.run(_reset_tables())


def test_custom_simple_payload_handles_leader_command_and_logs(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        asyncio.run(_seed_leader_phone())
        client = _admin_client(monkeypatch)
        res = client.post(
            "/api/v1/webhooks/whatsapp/reply",
            json={"phone": "+91 98765 01111", "message": "/status", "wa_message_id": "wamid.simple.1"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["matched"] is False

        fac = test_conftest.get_test_session_factory()
        async def _read_logs() -> list[WhatsAppLog]:
            async with fac() as session:
                return (await session.execute(select(WhatsAppLog).order_by(WhatsAppLog.id.asc()))).scalars().all()
        logs = asyncio.run(_read_logs())
        assert len(logs) == 1
        assert logs[0].direction == "in"
        assert logs[0].message_type == "inbound_leader"
        assert logs[0].message_preview == "/status"
    finally:
        asyncio.run(_reset_tables())


def test_meta_interactive_button_reply_logs_as_leader_inbound(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        asyncio.run(_seed_leader_phone())
        client = _admin_client(monkeypatch)
        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "messages": [
                                    {
                                        "from": "919876501111",
                                        "id": "wamid.button.1",
                                        "type": "interactive",
                                        "interactive": {
                                            "type": "button_reply",
                                            "button_reply": {
                                                "id": "status",
                                                "title": "Status",
                                            },
                                        },
                                    }
                                ],
                            }
                        }
                    ]
                }
            ],
        }
        res = client.post("/api/v1/webhooks/whatsapp/reply", json=payload)
        assert res.status_code == 200, res.text
        assert res.json()["matched"] is False

        fac = test_conftest.get_test_session_factory()
        async def _read_logs() -> list[WhatsAppLog]:
            async with fac() as session:
                return (await session.execute(select(WhatsAppLog).order_by(WhatsAppLog.id.asc()))).scalars().all()
        logs = asyncio.run(_read_logs())
        assert len(logs) == 1
        assert logs[0].direction == "in"
        assert logs[0].message_type == "inbound_leader"
        assert logs[0].message_preview == "Status"
    finally:
        asyncio.run(_reset_tables())


def test_custom_simple_payload_matches_removal_and_logs_member(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        asyncio.run(_seed_removal_outreach())
        client = _admin_client(monkeypatch)
        res = client.post(
            "/api/v1/webhooks/whatsapp/reply",
            json={"phone": "+91 98765 00000", "message": "I was unwell", "wa_message_id": "wamid.simple.2"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["matched"] is True

        fac = test_conftest.get_test_session_factory()

        async def _read_state() -> tuple[list[WhatsAppLog], list[MemberRemovalOutreach]]:
            async with fac() as session:
                logs = (await session.execute(select(WhatsAppLog).order_by(WhatsAppLog.id.asc()))).scalars().all()
                outreach = (await session.execute(select(MemberRemovalOutreach))).scalars().all()
                return logs, outreach

        logs, outreach = asyncio.run(_read_state())
        assert len(logs) == 1
        assert logs[0].message_type == "inbound_member"
        assert outreach[0].reply_text == "I was unwell"
    finally:
        asyncio.run(_reset_tables())
