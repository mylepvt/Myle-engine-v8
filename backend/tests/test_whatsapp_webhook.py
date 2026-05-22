"""Tests for WhatsApp webhook endpoints.

Covers:
- GET /api/v1/webhooks/whatsapp/reply  (Meta challenge verification)
- POST /api/v1/webhooks/whatsapp/reply (inbound messages — Meta format + simple format)
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import AsyncClient

VERIFY_URL = "/api/v1/webhooks/whatsapp/reply"
REPLY_URL = "/api/v1/webhooks/whatsapp/reply"
TEST_VERIFY_TOKEN = "pytest-verify-token-abc123"


# ── GET — Meta webhook challenge verification ─────────────────────────────────

async def test_webhook_verify_valid_token(anon_client: AsyncClient):
    """Valid token + mode=subscribe → returns hub_challenge as plain text."""
    with patch(
        "app.api.v1.webhooks.get_verify_token",
        return_value=TEST_VERIFY_TOKEN,
    ):
        resp = await anon_client.get(
            VERIFY_URL,
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": TEST_VERIFY_TOKEN,
                "hub.challenge": "challenge_string_xyz",
            },
        )
    assert resp.status_code == 200
    assert resp.text == "challenge_string_xyz"


async def test_webhook_verify_wrong_token(anon_client: AsyncClient):
    """Wrong token → 403 Forbidden."""
    with patch(
        "app.api.v1.webhooks.get_verify_token",
        return_value=TEST_VERIFY_TOKEN,
    ):
        resp = await anon_client.get(
            VERIFY_URL,
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong-token",
                "hub.challenge": "challenge_string_xyz",
            },
        )
    assert resp.status_code == 403


async def test_webhook_verify_empty_token(anon_client: AsyncClient):
    """Empty configured token (unconfigured) → 403 even if query token matches."""
    with patch(
        "app.api.v1.webhooks.get_verify_token",
        return_value="",
    ):
        resp = await anon_client.get(
            VERIFY_URL,
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "",
                "hub.challenge": "xyz",
            },
        )
    assert resp.status_code == 403


# ── POST — Meta Cloud API format ──────────────────────────────────────────────

async def test_webhook_post_meta_status_update(anon_client: AsyncClient):
    """Meta sends delivery/read status updates — should ack without error."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "statuses": [{"id": "wamid.abc", "status": "delivered"}],
                            "messages": [],
                        }
                    }
                ]
            }
        ],
    }
    resp = await anon_client.post(REPLY_URL, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body.get("note") == "no_supported_messages"


async def test_webhook_post_meta_text_message(anon_client: AsyncClient):
    """Meta sends a text message — processed even if no outreach record matches."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "919876543210",
                                    "id": "wamid.testid001",
                                    "type": "text",
                                    "text": {"body": "I am interested"},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    resp = await anon_client.post(REPLY_URL, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    # No outreach record exists in test DB, so matched=False or count=0
    assert body.get("matched") is False or body.get("count", 0) == 0


async def test_webhook_post_meta_invalid_json(anon_client: AsyncClient):
    """Non-JSON body → 400 Bad Request."""
    resp = await anon_client.post(
        REPLY_URL,
        content=b"not json at all",
        headers={"Content-Type": "text/plain"},
    )
    assert resp.status_code == 400


# ── POST — Simple / custom automation format ──────────────────────────────────

async def test_webhook_post_simple_no_secret_configured(anon_client: AsyncClient):
    """When REMOVAL_WHATSAPP_REPLY_SECRET is empty, no auth header required."""
    with patch("app.api.v1.webhooks.settings") as mock_settings:
        mock_settings.removal_whatsapp_reply_secret = ""
        resp = await anon_client.post(
            REPLY_URL,
            json={"phone": "+919876543210", "message": "hello test"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True


async def test_webhook_post_simple_wrong_secret(anon_client: AsyncClient):
    """When secret is configured and bearer is wrong → 401."""
    with patch("app.api.v1.webhooks.settings") as mock_settings:
        mock_settings.removal_whatsapp_reply_secret = "real-secret"
        resp = await anon_client.post(
            REPLY_URL,
            json={"phone": "+919876543210", "message": "hello"},
            headers={"Authorization": "Bearer wrong-secret"},
        )
    assert resp.status_code == 401


async def test_webhook_post_simple_correct_secret(anon_client: AsyncClient):
    """Correct bearer secret + valid payload → 200 ok."""
    with patch("app.api.v1.webhooks.settings") as mock_settings:
        mock_settings.removal_whatsapp_reply_secret = "correct-secret"
        resp = await anon_client.post(
            REPLY_URL,
            json={"phone": "+919876543210", "message": "I want to join"},
            headers={"Authorization": "Bearer correct-secret"},
        )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


async def test_webhook_post_simple_missing_required_field(anon_client: AsyncClient):
    """Simple format without required 'message' field → 422."""
    with patch("app.api.v1.webhooks.settings") as mock_settings:
        mock_settings.removal_whatsapp_reply_secret = ""
        resp = await anon_client.post(
            REPLY_URL,
            json={"phone": "+919876543210"},  # missing message
        )
    assert resp.status_code == 422
