"""Compatibility helpers for CRM shadow payload snapshots.

Request handlers no longer call CRM directly. The production path is:
FastAPI write -> same-transaction outbox row -> worker delivery to CRM.
This module remains as a thin shim so older imports and tests keep using the
canonical mapping logic from ``app.services.crm_outbox``.
"""

from __future__ import annotations

from typing import Any

from app.models.lead import Lead
from app.services.crm_outbox import CRM_OUTBOX_EVENT_LEAD_UPSERT, build_shadow_payload, crm_shadow_stage_for_lead


def legacy_shadow_payload(lead: Lead) -> dict[str, Any]:
    """Return a JSON-safe lead snapshot using the canonical outbox payload shape."""
    version = int(getattr(lead, "crm_shadow_version", 0) or 0)
    return build_shadow_payload(
        lead,
        version=version,
        event_type=CRM_OUTBOX_EVENT_LEAD_UPSERT,
    )


__all__ = ["crm_shadow_stage_for_lead", "legacy_shadow_payload"]
