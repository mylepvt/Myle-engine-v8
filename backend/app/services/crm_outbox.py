from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import Select, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.models.crm_outbox import CrmOutbox
from app.models.lead import Lead

logger = logging.getLogger(__name__)

CRM_OUTBOX_EVENT_LEAD_UPSERT = "LEAD_UPSERT"
CRM_OUTBOX_EVENT_LEAD_DELETE = "LEAD_DELETE"

CRM_OUTBOX_STATUS_PENDING = "pending"
CRM_OUTBOX_STATUS_PROCESSING = "processing"
CRM_OUTBOX_STATUS_DONE = "done"
CRM_OUTBOX_STATUS_FAILED = "failed"


@dataclass(slots=True)
class ClaimedCrmOutboxEvent:
    id: UUID
    lead_id: int
    event_type: str
    payload: dict[str, Any]
    retries: int
    version: int


def crm_shadow_stage_for_lead(lead: Lead) -> str:
    """Map FastAPI lead state to the closest CRM funnel stage without losing the legacy journey."""
    status = (lead.status or "").strip()

    if status in {"converted", "lost"}:
        return "CLOSED"
    if status in {"day3", "interview", "track_selected", "seat_hold", "training", "plan_2cc", "level_up", "pending"}:
        return "DAY3_CLOSER"
    if status == "day2":
        return "DAY2_ADMIN"
    if status == "day1":
        return "DAY1_UPLINE"
    if status == "mindset_lock":
        return "MINDSET_LOCK"
    if status == "paid":
        return "PAYMENT_DONE"
    if status == "whatsapp_sent":
        return "WHATSAPP_SENT"
    if status in {"video_sent", "video_watched"}:
        return "VIDEO_SENT"
    if status == "invited":
        return "WHATSAPP_SENT" if lead.whatsapp_sent_at is not None else "INVITED"
    return "NEW"


def build_shadow_payload(
    lead: Lead,
    *,
    version: int,
    event_type: str,
    deleted: bool = False,
    deleted_at: datetime | None = None,
    permanently_deleted: bool = False,
) -> dict[str, Any]:
    idempotency_key = f"lead-{lead.id}-v{version}"
    effective_deleted_at = deleted_at or lead.deleted_at
    return {
        "legacyId": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "pipelineKind": "TEAM",
        "legacyStatus": lead.status,
        "stage": "CLOSED" if deleted else crm_shadow_stage_for_lead(lead),
        "whatsappSentAt": lead.whatsapp_sent_at.isoformat() if lead.whatsapp_sent_at else None,
        "paymentStatus": lead.payment_status,
        "mindsetLockState": lead.mindset_lock_state,
        "mindsetStartedAt": lead.mindset_started_at.isoformat() if lead.mindset_started_at else None,
        "mindsetCompletedAt": lead.mindset_completed_at.isoformat() if lead.mindset_completed_at else None,
        "day1CompletedAt": lead.day1_completed_at.isoformat() if lead.day1_completed_at else None,
        "day2CompletedAt": lead.day2_completed_at.isoformat() if lead.day2_completed_at else None,
        "day3CompletedAt": lead.day3_completed_at.isoformat() if lead.day3_completed_at else None,
        "version": version,
        "idempotencyKey": idempotency_key,
        "eventType": event_type,
        "deleted": deleted,
        "deletedAt": effective_deleted_at.isoformat() if effective_deleted_at else None,
        "permanentlyDeleted": permanently_deleted,
    }


def _enqueue_payload(
    session: AsyncSession,
    *,
    lead_id: int,
    event_type: str,
    payload: dict[str, Any],
    version: int,
) -> None:
    session.add(
        CrmOutbox(
            lead_id=lead_id,
            event_type=event_type,
            payload=payload,
            version=version,
            idempotency_key=str(payload["idempotencyKey"]),
            status=CRM_OUTBOX_STATUS_PENDING,
            retries=0,
            next_attempt_at=datetime.now(timezone.utc),
        )
    )


def enqueue_lead_shadow_upsert(session: AsyncSession, lead: Lead, *, event_type: str = CRM_OUTBOX_EVENT_LEAD_UPSERT) -> int:
    version = int(lead.crm_shadow_version or 0) + 1
    lead.crm_shadow_version = version
    payload = build_shadow_payload(lead, version=version, event_type=event_type)
    _enqueue_payload(session, lead_id=lead.id, event_type=event_type, payload=payload, version=version)
    return version


def enqueue_lead_shadow_delete(
    session: AsyncSession,
    lead: Lead,
    *,
    permanently_deleted: bool = False,
) -> int:
    version = int(lead.crm_shadow_version or 0) + 1
    if not permanently_deleted:
        lead.crm_shadow_version = version
    payload = build_shadow_payload(
        lead,
        version=version,
        event_type=CRM_OUTBOX_EVENT_LEAD_DELETE,
        deleted=True,
        deleted_at=lead.deleted_at or datetime.now(timezone.utc),
        permanently_deleted=permanently_deleted,
    )
    _enqueue_payload(
        session,
        lead_id=lead.id,
        event_type=CRM_OUTBOX_EVENT_LEAD_DELETE,
        payload=payload,
        version=version,
    )
    return version


def _pending_claim_query(now: datetime) -> Select[tuple[CrmOutbox]]:
    earlier = aliased(CrmOutbox)
    return (
        select(CrmOutbox)
        .where(
            CrmOutbox.status == CRM_OUTBOX_STATUS_PENDING,
            CrmOutbox.next_attempt_at <= now,
            ~exists(
                select(1)
                .select_from(earlier)
                .where(
                    earlier.lead_id == CrmOutbox.lead_id,
                    earlier.status.in_(
                        [CRM_OUTBOX_STATUS_PENDING, CRM_OUTBOX_STATUS_PROCESSING]
                    ),
                    earlier.version < CrmOutbox.version,
                )
            ),
        )
        .order_by(CrmOutbox.created_at.asc(), CrmOutbox.version.asc())
        .limit(settings.crm_outbox_batch_size)
        .with_for_update(skip_locked=True)
    )


async def claim_pending_crm_outbox(
    session: AsyncSession,
    *,
    limit: int | None = None,
) -> list[ClaimedCrmOutboxEvent]:
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(seconds=settings.crm_outbox_processing_timeout_seconds)

    await session.execute(
        update(CrmOutbox)
        .where(
            CrmOutbox.status == CRM_OUTBOX_STATUS_PROCESSING,
            CrmOutbox.processing_started_at.is_not(None),
            CrmOutbox.processing_started_at <= stale_before,
        )
        .values(
            status=CRM_OUTBOX_STATUS_PENDING,
            next_attempt_at=now,
            processing_started_at=None,
            last_error="Recovered stale processing lease",
        )
    )

    stmt = _pending_claim_query(now)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())
    for row in rows:
        row.status = CRM_OUTBOX_STATUS_PROCESSING
        row.processing_started_at = now
        row.last_error = None
    await session.commit()

    return [
        ClaimedCrmOutboxEvent(
            id=row.id,
            lead_id=row.lead_id,
            event_type=row.event_type,
            payload=dict(row.payload or {}),
            retries=row.retries,
            version=row.version,
        )
        for row in rows
    ]


async def mark_crm_outbox_done(session: AsyncSession, event_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await session.execute(
        update(CrmOutbox)
        .where(CrmOutbox.id == event_id)
        .values(
            status=CRM_OUTBOX_STATUS_DONE,
            processed_at=now,
            processing_started_at=None,
            last_error=None,
        )
    )
    await session.commit()


def compute_next_attempt_at(*, retries: int, now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    delay_seconds = settings.crm_outbox_retry_base_seconds * (2 ** max(0, retries - 1))
    delay_seconds = min(delay_seconds, settings.crm_outbox_retry_max_seconds)
    return current + timedelta(seconds=delay_seconds)


async def mark_crm_outbox_retry(
    session: AsyncSession,
    event: ClaimedCrmOutboxEvent,
    error_message: str,
) -> None:
    retries = event.retries + 1
    values: dict[str, Any] = {
        "retries": retries,
        "processing_started_at": None,
        "last_error": (error_message or "CRM delivery failed")[:1000],
    }
    if retries >= settings.crm_outbox_max_retries:
        values["status"] = CRM_OUTBOX_STATUS_FAILED
    else:
        values["status"] = CRM_OUTBOX_STATUS_PENDING
        values["next_attempt_at"] = compute_next_attempt_at(retries=retries)
    await session.execute(update(CrmOutbox).where(CrmOutbox.id == event.id).values(**values))
    await session.commit()


async def deliver_crm_outbox_event(
    event: ClaimedCrmOutboxEvent,
    *,
    client: httpx.AsyncClient,
) -> None:
    legacy_id = int(event.payload["legacyId"])
    response = await client.post(
        f"/api/v1/leads/{legacy_id}/legacy-shadow",
        json=event.payload,
        headers={"x-internal-secret": settings.crm_internal_secret},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"CRM shadow sync failed HTTP {response.status_code}: {response.text[:200]}")


async def process_crm_outbox_batch(
    session: AsyncSession,
    *,
    client: httpx.AsyncClient,
    limit: int | None = None,
) -> dict[str, int]:
    claimed = await claim_pending_crm_outbox(session, limit=limit)
    stats = {"claimed": len(claimed), "done": 0, "retried": 0, "failed": 0}
    for event in claimed:
        try:
            await deliver_crm_outbox_event(event, client=client)
            await mark_crm_outbox_done(session, event.id)
            stats["done"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "CRM outbox delivery failed for lead=%s version=%s: %s",
                event.lead_id,
                event.version,
                exc,
            )
            await mark_crm_outbox_retry(session, event, str(exc))
            if event.retries + 1 >= settings.crm_outbox_max_retries:
                stats["failed"] += 1
            else:
                stats["retried"] += 1
    return stats
