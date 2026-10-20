"""Myle Bridge — this CRM ⇄ Myle Ledger (shack-craft/myle, ``lib/bridge/core.ts``).

Ledger → CRM: ``POST /api/v1/bridge/pool-ingest`` (``app.api.v1.bridge``) puts a sent
"CRM" dispatch line's leads straight into the shared pool; each keeps the Ledger's
lead key in ``Lead.external_ref``, so a repeat delivery never doubles a lead.

CRM → Ledger: whatever happens to those leads goes back as events —
``lead.claimed`` (pool → a member, with the price in paise), ``lead.status_changed``
and ``lead.refunded``. They are written to ``ledger_bridge_outbox`` in the SAME
transaction as the change (a ``before_flush`` hook, or ``queue_refund`` from the refund
service), so a rolled-back save sends nothing and a committed one is never lost.
``run_scheduled_delivery`` (every minute) posts them to ``<LEDGER_BRIDGE_URL>/api/bridge/events``
and retries with backoff; the Ledger stores each event id once.

Both directions are signed:
    X-Myle-Timestamp: <unix seconds>
    X-Myle-Signature: hex(HMAC-SHA256(MYLE_BRIDGE_SECRET, "<timestamp>.<raw body>"))
and refused when the clock is more than 5 minutes off.

Switch off: leave ``MYLE_BRIDGE_SECRET`` empty — the endpoint refuses everything and no
events are queued.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import delete, event as sa_event, inspect, select
from sqlalchemy.orm import Session as SASession

from app.core.config import settings
from app.core.lead_status import LEAD_STATUS_LABELS
from app.models.lead import Lead
from app.models.ledger_bridge_outbox import LedgerBridgeOutbox

logger = logging.getLogger(__name__)

MAX_SKEW_SECONDS = 300
MAX_BATCH = 200
MAX_ATTEMPTS = 50  # ~ two days of retries at the 1-hour cap
HTTP_TIMEOUT_SECONDS = 20.0
SENT_ROW_RETENTION = timedelta(days=30)


def enabled() -> bool:
    return len(settings.myle_bridge_secret or "") >= 32


def _delivery_enabled() -> bool:
    return enabled() and bool((settings.ledger_bridge_url or "").strip())


# ── signatures ───────────────────────────────────────────────────────────────


def sign(secret: str, timestamp: int, body: bytes) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def signed_headers(body: bytes, now: float | None = None) -> dict[str, str]:
    ts = int(now if now is not None else time.time())
    return {
        "Content-Type": "application/json",
        "X-Myle-Timestamp": str(ts),
        "X-Myle-Signature": sign(settings.myle_bridge_secret, ts, body),
    }


def verify(timestamp: str | None, signature: str | None, body: bytes, now: float | None = None) -> bool:
    if not enabled() or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - ts) > MAX_SKEW_SECONDS:
        return False
    return hmac.compare_digest(sign(settings.myle_bridge_secret, ts, body), signature.strip().lower())


# ── events (same transaction as the change) ──────────────────────────────────


def _event(lead: Lead, kind: str, **extra: Any) -> LedgerBridgeOutbox:
    event_id = uuid.uuid4().hex
    payload = {
        "event_id": event_id,
        "type": kind,
        "myle_lead_id": lead.external_ref,
        "phone": lead.phone,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    return LedgerBridgeOutbox(event_id=event_id, payload=payload)


def _changed(history) -> bool:
    if not history.has_changes():
        return False
    if history.deleted and history.added:
        return history.deleted[0] != history.added[0]
    return True


@sa_event.listens_for(SASession, "before_flush")
def _queue_lead_events(session: SASession, _ctx, _instances) -> None:
    if not enabled():
        return
    try:
        for obj in list(session.dirty):
            if not isinstance(obj, Lead) or not obj.external_ref:
                continue
            state = inspect(obj)
            pool = state.attrs.in_pool.history
            if _changed(pool) and pool.deleted and pool.deleted[0] and not obj.in_pool:
                waived = bool(obj.waived_reason)
                session.add(
                    _event(
                        obj,
                        "lead.claimed",
                        status="claimed",
                        # A lead given free costs the member nothing.
                        amount_paise=0 if waived else int(obj.pool_price_cents or 0),
                        member_id=obj.assigned_to_user_id,
                        member_name=_member_name(session, obj.assigned_to_user_id),
                        **({"waived_reason": obj.waived_reason} if waived else {}),
                    )
                )
            if _changed(state.attrs.status.history):
                session.add(
                    _event(
                        obj,
                        "lead.status_changed",
                        status=obj.status,
                        status_label=LEAD_STATUS_LABELS.get(obj.status, (obj.status or "").replace("_", " ").title()),
                    )
                )
    except Exception as exc:  # noqa: BLE001 — never break the member's save
        logger.warning("ledger_bridge: could not queue events: %s", exc)


def queue_refund(session, lead: Lead, amount_cents: int) -> None:
    """Called by the refund service, inside its transaction."""
    if enabled() and lead.external_ref:
        session.add(
            _event(
                lead,
                "lead.refunded",
                status="refunded",
                amount_paise=-abs(int(amount_cents)),
                member_id=lead.owner_user_id or lead.assigned_to_user_id,
                member_name=_member_name(session, lead.owner_user_id or lead.assigned_to_user_id),
            )
        )


def _member_name(session, user_id: int | None) -> str | None:
    """The member's display name; best effort, never fails the caller's save."""
    if not user_id:
        return None
    from app.models.user import User

    try:
        user = session.identity_map.get(inspect(User).identity_key_from_primary_key((int(user_id),)))
        if user is not None:
            return user.name or user.username or user.fbo_id
        if hasattr(session, "sync_session"):  # an AsyncSession: no blocking read here
            return None
        # Inside before_flush autoflush is off, so this reads without recursing.
        row = session.execute(select(User.name, User.username, User.fbo_id).where(User.id == int(user_id))).first()
    except Exception:  # noqa: BLE001
        return None
    return (row[0] or row[1] or row[2]) if row else None


WALLET_KINDS = ("recharge", "promo", "adjustment")


async def queue_wallet(session, *, user, kind: str, amount_cents: int, ref: str, note: str | None = None) -> None:
    """A member's wallet money for Myle Ledger's CRM accounting, inside the caller's
    transaction: an approved recharge (cash in), a promo / free credit, or another admin
    adjustment. ``ref`` makes it one event per source row (recharge id, idempotency key)."""
    if not enabled() or kind not in WALLET_KINDS or not amount_cents:
        return
    event_id = hashlib.sha256(f"wallet:{kind}:{ref}".encode()).hexdigest()[:32]
    # A retried request (same ref) is queued once; a second row would break the caller's save.
    if (await session.execute(select(LedgerBridgeOutbox.id).where(LedgerBridgeOutbox.event_id == event_id))).first():
        return
    payload = {
        "event_id": event_id,
        "type": "wallet.credit" if kind != "recharge" else "wallet.recharge",
        "wallet_kind": kind,
        "member_id": user.id,
        "member_name": user.name or user.username or user.fbo_id,
        "amount_paise": int(amount_cents),
        "note": (note or "")[:200] or None,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    session.add(LedgerBridgeOutbox(event_id=event_id, payload=payload))


# ── delivery ─────────────────────────────────────────────────────────────────


def _session_factory():
    from app.db.session import get_session_factory

    return get_session_factory()()


def _retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(60 * 2 ** max(0, attempts - 1), 3600))


async def post_events(events: list[dict[str, Any]], *, client: httpx.AsyncClient | None = None) -> None:
    body = json.dumps({"events": events}, separators=(",", ":")).encode()
    url = settings.ledger_bridge_url.strip().rstrip("/") + "/api/bridge/events"
    own = client is None
    http = client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS)
    try:
        response = await http.post(url, content=body, headers=signed_headers(body))
        if response.status_code != 200:
            raise RuntimeError(f"ledger answered {response.status_code}: {response.text[:200]}")
    finally:
        if own:
            await http.aclose()


async def deliver_pending(*, client: httpx.AsyncClient | None = None) -> int:
    """Sends one batch of due events; returns how many went."""
    if not _delivery_enabled():
        return 0
    now = datetime.now(timezone.utc)
    async with _session_factory() as session:
        rows = (
            await session.execute(
                select(LedgerBridgeOutbox)
                .where(LedgerBridgeOutbox.status == "pending", LedgerBridgeOutbox.next_attempt_at <= now)
                .order_by(LedgerBridgeOutbox.id)
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
                if r.attempts >= MAX_ATTEMPTS:
                    r.status = "failed"
                    logger.error("ledger_bridge: gave up on event %s: %s", r.event_id, exc)
            await session.commit()
            return 0
        for r in rows:
            r.status = "sent"
            r.sent_at = now
            r.last_error = None
        await session.commit()
        return len(rows)


async def run_scheduled_delivery() -> None:
    """Minute job: sends what's due and drops sent rows after 30 days."""
    if not _delivery_enabled():
        return
    try:
        for _ in range(10):
            if not await deliver_pending():
                break
        async with _session_factory() as session:
            cutoff = datetime.now(timezone.utc) - SENT_ROW_RETENTION
            await session.execute(
                delete(LedgerBridgeOutbox).where(LedgerBridgeOutbox.status == "sent", LedgerBridgeOutbox.sent_at < cutoff)
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("ledger_bridge: delivery run failed: %s", exc)
