"""Security deposit records → Myle Ledger's own "Security Deposits" book.

Separate from the lead/wallet bridge events: own outbox (``deposit_ledger_outbox``), own
Ledger endpoint (``<LEDGER_BRIDGE_URL>/api/bridge/deposits``). Only the transport is shared —
the same MYLE_BRIDGE_SECRET signature (``ledger_bridge.signed_headers``).

Events are written in the same transaction as the change, and retried (backoff capped at an
hour) until the Ledger answers 200 — never given up on, so a Ledger deployed later still
receives every deposit from day one. The Ledger stores each ``event_id`` once.

Event types: deposit.consent_given, deposit.consent_withdrawn, deposit.receipt_issued,
deposit.receipt_cancelled, deposit.refunded. Each carries the full current record
(``receipt`` and/or ``consent``), so the Ledger can upsert by receipt number / consent id.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select

from app.core.config import settings
from app.models.deposit import DepositLedgerOutbox

logger = logging.getLogger(__name__)

MAX_BATCH = 100
HTTP_TIMEOUT_SECONDS = 20.0
SENT_ROW_RETENTION = timedelta(days=90)


def enabled() -> bool:
    from app.services import ledger_bridge

    return ledger_bridge.enabled()


def _delivery_enabled() -> bool:
    return enabled() and bool((settings.ledger_bridge_url or "").strip())


def queue(session, kind: str, **records: Any) -> None:
    """Called inside the caller's transaction."""
    if not enabled():
        return
    event_id = uuid.uuid4().hex
    payload = {
        "event_id": event_id,
        "type": kind,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        **records,
    }
    session.add(DepositLedgerOutbox(event_id=event_id, payload=payload))


def _retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(60 * 2 ** max(0, attempts - 1), 3600))


async def post_events(events: list[dict[str, Any]], *, client: httpx.AsyncClient | None = None) -> None:
    from app.services.ledger_bridge import signed_headers

    body = json.dumps({"events": events}, separators=(",", ":"), ensure_ascii=False).encode()
    url = settings.ledger_bridge_url.strip().rstrip("/") + "/api/bridge/deposits"
    own = client is None
    http = client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS)
    try:
        response = await http.post(url, content=body, headers=signed_headers(body))
        if response.status_code != 200:
            raise RuntimeError(f"ledger answered {response.status_code}: {response.text[:200]}")
    finally:
        if own:
            await http.aclose()


def _session_factory():
    from app.db.session import get_session_factory

    return get_session_factory()()


async def deliver_pending(*, client: httpx.AsyncClient | None = None) -> int:
    """Sends one batch of due events; returns how many went."""
    if not _delivery_enabled():
        return 0
    now = datetime.now(timezone.utc)
    async with _session_factory() as session:
        rows = (
            await session.execute(
                select(DepositLedgerOutbox)
                .where(DepositLedgerOutbox.status == "pending", DepositLedgerOutbox.next_attempt_at <= now)
                .order_by(DepositLedgerOutbox.id)
                .limit(MAX_BATCH)
            )
        ).scalars().all()
        if not rows:
            return 0
        try:
            await post_events([r.payload for r in rows], client=client)
        except Exception as exc:  # noqa: BLE001
            for r in rows:
                r.attempts += 1
                r.last_error = str(exc)[:500]
                r.next_attempt_at = now + _retry_delay(r.attempts)
            await session.commit()
            return 0
        for r in rows:
            r.status = "sent"
            r.sent_at = now
            r.last_error = None
        await session.commit()
        return len(rows)


async def run_scheduled_delivery() -> None:
    """Minute job: sends what's due and drops sent rows after 90 days."""
    if not _delivery_enabled():
        return
    try:
        for _ in range(10):
            if not await deliver_pending():
                break
        async with _session_factory() as session:
            cutoff = datetime.now(timezone.utc) - SENT_ROW_RETENTION
            await session.execute(
                delete(DepositLedgerOutbox).where(DepositLedgerOutbox.status == "sent", DepositLedgerOutbox.sent_at < cutoff)
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("deposit_ledger: delivery run failed: %s", exc)
