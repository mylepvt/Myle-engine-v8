"""Secure enrollment-video WhatsApp delivery."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.services.enrollment_video import whatsapp_digits

logger = logging.getLogger(__name__)

_DEFAULT_TEMPLATE = "enrollment_video_secure_v1"


def _post_json_sync(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float) -> tuple[int, str]:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    hdrs = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        body = resp.read().decode("utf-8", errors="replace")
        return int(resp.status), body[:2000]


def build_secure_enrollment_message(*, lead_name: str, watch_url: str) -> str:
    first_name = (lead_name or "there").strip().split()[0]
    return (
        f"Hi {first_name},\n"
        "Your private Myle enrollment room is ready.\n"
        "This link is valid for 30 minutes and opens only with your registered number.\n\n"
        f"{watch_url}"
    )


def build_manual_share_url(*, phone: str | None, message: str) -> str | None:
    digits = whatsapp_digits(phone)
    if not digits:
        return None
    return f"https://wa.me/{digits}?text={urllib.parse.quote(message)}"


async def send_enrollment_video_whatsapp(
    *,
    lead_id: int,
    phone: str | None,
    lead_name: str,
    watch_url: str,
    expires_at: datetime,
    title: str,
) -> dict[str, Any]:
    message = build_secure_enrollment_message(lead_name=lead_name, watch_url=watch_url)
    manual_share_url = build_manual_share_url(phone=phone, message=message)

    url = (settings.ctcs_whatsapp_webhook_url or "").strip()
    if not url:
        logger.info("enrollment whatsapp stub lead_id=%s phone_tail=%s", lead_id, (phone or "")[-4:])
        return {
            "ok": True,
            "channel": "whatsapp_stub",
            "template": _DEFAULT_TEMPLATE,
            "manual_share_url": manual_share_url,
            "message_preview": message[:500],
        }

    payload: dict[str, Any] = {
        "event": "enrollment_video_share",
        "lead_id": lead_id,
        "phone": phone,
        "lead_name": lead_name,
        "watch_url": watch_url,
        "expires_at": expires_at.isoformat(),
        "title": title,
        "template": _DEFAULT_TEMPLATE,
        "message": message,
    }
    headers: dict[str, str] = {}
    secret = (settings.ctcs_whatsapp_webhook_secret or "").strip()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"

    timeout = float(settings.ctcs_whatsapp_timeout_seconds)
    try:
        status, preview = await asyncio.to_thread(_post_json_sync, url, payload, headers, timeout)
        ok = 200 <= status < 300
        if not ok:
            logger.warning("enrollment whatsapp webhook non-success status=%s preview=%s", status, preview[:200])
        return {
            "ok": ok,
            "channel": "whatsapp_webhook",
            "http_status": status,
            "body_preview": preview[:500],
            "manual_share_url": manual_share_url,
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500] if e.fp else ""
        logger.warning("enrollment whatsapp HTTPError %s: %s", e.code, body)
        return {
            "ok": False,
            "channel": "whatsapp_webhook",
            "error": f"http_{e.code}",
            "detail": body,
            "manual_share_url": manual_share_url,
        }
    except Exception as e:
        logger.exception("enrollment whatsapp webhook failed")
        return {
            "ok": False,
            "channel": "whatsapp_webhook",
            "error": str(e),
            "manual_share_url": manual_share_url,
        }
