"""
CRM Sync helpers — called internally by FastAPI after lead create/claim.

These are NOT public API endpoints. They fire-and-forget to the CRM
to keep shadow records in sync. Failures are logged but never propagate
to the caller (non-blocking).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.crm_api_url,
            timeout=httpx.Timeout(10.0),
        )
    return _client


async def _post(path: str, payload: dict[str, Any], token: str) -> None:
    """Fire-and-forget POST to CRM. Logs on failure, never raises."""
    try:
        client = _get_client()
        r = await client.post(
            path,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code >= 400:
            logger.warning("CRM sync %s → HTTP %s: %s", path, r.status_code, r.text[:200])
    except Exception as exc:  # noqa: BLE001
        logger.warning("CRM sync %s failed: %s", path, exc)


async def sync_lead_created(
    *,
    legacy_id: int,
    name: str,
    phone: str | None,
    pipeline_kind: str,
    token: str,
) -> None:
    """Create a CRM shadow lead with legacyId set to the FastAPI lead PK."""
    await _post(
        "/api/v1/leads",
        {
            "name": name,
            "phone": phone,
            "pipelineKind": pipeline_kind,
            "legacyId": legacy_id,
        },
        token,
    )


async def ensure_crm_shadow(
    *,
    legacy_id: int,
    name: str,
    phone: str | None,
    pipeline_kind: str,
    token: str,
) -> bool:
    """Check if CRM shadow exists for legacyId; create if missing. Returns True if exists/created."""
    try:
        client = _get_client()
        r = await client.get(
            f"/api/v1/leads?legacyId={legacy_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 0:
                return True
            if isinstance(data, dict) and data.get("items"):
                return True
        # Create shadow
        await sync_lead_created(legacy_id=legacy_id, name=name, phone=phone,
                                  pipeline_kind=pipeline_kind, token=token)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("ensure_crm_shadow failed for legacyId %s: %s", legacy_id, exc)
        return False


async def sync_lead_claimed(
    *,
    legacy_id: int,
    idempotency_key: str,
    pipeline_kind: str,
    token: str,
) -> None:
    """Trigger CRM pool claim for a lead identified by legacyId."""
    await _post(
        "/api/v1/pool/claim",
        {
            "leadId": legacy_id,
            "idempotencyKey": idempotency_key,
            "pipelineKind": pipeline_kind,
        },
        token,
    )
