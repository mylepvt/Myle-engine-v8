from __future__ import annotations

import asyncio

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.app_setting import AppSetting
from app.models.member_removal_outreach import MemberRemovalOutreach
from app.models.whatsapp_inbound_message import WhatsAppInboundMessage
from app.models.whatsapp_log import WhatsAppLog
from main import app
from util_jwt_patch import patch_jwt_settings


async def _reset_tables() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(WhatsAppLog))
        await session.execute(delete(WhatsAppInboundMessage))
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


def test_meta_text_reply_is_stored_and_matched(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        asyncio.run(_seed_removal_outreach())
        client = _admin_client(monkeypatch)
        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "contacts": [
                                    {"wa_id": "919876500000", "profile": {"name": "Lead Reply"}}
                                ],
                                "messages": [
                                    {
                                        "from": "919876500000",
                                        "id": "wamid.text.1",
                                        "type": "text",
                                        "text": {"body": "Interested"},
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
        assert res.json()["stored"] == 1
        assert res.json()["matched"] is True

        inbox = client.get("/api/v1/webhooks/whatsapp/inbox")
        assert inbox.status_code == 200, inbox.text
        body = inbox.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["phone"] == "919876500000"
        assert item["profile_name"] == "Lead Reply"
        assert item["message_text"] == "Interested"
        assert item["command_key"] == "interested"
        assert item["matched_removal_outreach_id"] is not None
    finally:
        asyncio.run(_reset_tables())


def test_meta_button_reply_is_stored_as_command(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        client = _admin_client(monkeypatch)
        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "contacts": [
                                    {"wa_id": "919999999999", "profile": {"name": "Button User"}}
                                ],
                                "messages": [
                                    {
                                        "from": "919999999999",
                                        "id": "wamid.button.1",
                                        "type": "interactive",
                                        "interactive": {
                                            "type": "button_reply",
                                            "button_reply": {
                                                "id": "CMD_INTERESTED",
                                                "title": "Interested",
                                            },
                                        },
                                        "context": {"id": "wamid.outbound.55"},
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
        assert res.json()["stored"] == 1

        inbox = client.get("/api/v1/webhooks/whatsapp/inbox")
        assert inbox.status_code == 200, inbox.text
        item = inbox.json()["items"][0]
        assert item["message_type"] == "interactive_button_reply"
        assert item["message_text"] == "Interested"
        assert item["command_key"] == "cmd_interested"
        assert item["reply_to_wa_message_id"] == "wamid.outbound.55"
    finally:
        asyncio.run(_reset_tables())


def test_whatsapp_logs_endpoint_boots_and_returns_empty_stats(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reset_tables())
    try:
        client = _admin_client(monkeypatch)
        res = client.get("/api/v1/webhooks/whatsapp/logs")
        assert res.status_code == 200, res.text
        assert res.json() == {
            "items": [],
            "total": 0,
            "sent_today": 0,
            "failed_today": 0,
            "received_today": 0,
        }
    finally:
        asyncio.run(_reset_tables())
