from __future__ import annotations

import asyncio

import pytest

from app.core.config import settings
from app.services.whatsapp_ctcs import send_interested_enrollment_assets


def test_interested_no_webhook_is_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.whatsapp_ctcs.settings",
        settings.model_copy(update={"ctcs_whatsapp_webhook_url": ""}),
    )
    out = asyncio.run(send_interested_enrollment_assets(lead_id=42, phone="+919876543210"))
    assert out["ok"] is True
    assert out["channel"] == "whatsapp_stub"


def test_interested_webhook_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.whatsapp_ctcs as whatsapp_mod

    async def fake_to_thread(_fn, *args, **kwargs):  # noqa: ANN001
        return (200, '{"received":true}')

    monkeypatch.setattr(
        "app.services.whatsapp_ctcs.settings",
        settings.model_copy(
            update={
                "ctcs_whatsapp_webhook_url": "https://example.invalid/ctcs-hook",
                "ctcs_whatsapp_webhook_secret": "secret",
            },
        ),
    )
    monkeypatch.setattr(whatsapp_mod.asyncio, "to_thread", fake_to_thread)
    out = asyncio.run(send_interested_enrollment_assets(lead_id=7, phone="999"))
    assert out["ok"] is True
    assert out["channel"] == "whatsapp_webhook"
    assert out.get("http_status") == 200
