"""CTCS WhatsApp / messaging hook when a lead is marked *interested*.

- If ``CTCS_WHATSAPP_WEBHOOK_URL`` is set: POST JSON (async via thread pool).
- Otherwise: log-only stub (no network).
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def _post_json_sync(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float) -> tuple[int, str]:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    hdrs = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — URL from trusted env
        body = resp.read().decode("utf-8", errors="replace")
        return int(resp.status), body[:2000]


async def send_interested_enrollment_assets(*, lead_id: int, phone: str | None) -> dict[str, Any]:
    url = (settings.ctcs_whatsapp_webhook_url or "").strip()
    if not url:
        payload = {"lead_id": lead_id, "phone_tail": (phone or "")[-4:] if phone else None}
        logger.info("whatsapp_ctcs stub (no CTCS_WHATSAPP_WEBHOOK_URL) %s", payload)
        return {"ok": True, "channel": "whatsapp_stub", "template": settings.ctcs_whatsapp_template}

    payload: dict[str, Any] = {
        "event": "ctcs_interested",
        "lead_id": lead_id,
        "phone": phone,
        "template": settings.ctcs_whatsapp_template,
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
            logger.warning("whatsapp_ctcs webhook non-success status=%s preview=%s", status, preview[:200])
        return {
            "ok": ok,
            "channel": "whatsapp_webhook",
            "http_status": status,
            "body_preview": preview[:500],
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500] if e.fp else ""
        logger.warning("whatsapp_ctcs HTTPError %s: %s", e.code, body)
        return {"ok": False, "channel": "whatsapp_webhook", "error": f"http_{e.code}", "detail": body}
    except Exception as e:
        logger.exception("whatsapp_ctcs webhook failed")
        return {"ok": False, "channel": "whatsapp_webhook", "error": str(e)}
