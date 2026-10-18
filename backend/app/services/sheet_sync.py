"""Google Sheet lead-status sync — feeds the "Shack Leads" ad-wise quality report.

Every time a lead is created, changes stage, gets a call result / drop reason, or a
calling-board "Not picked" / "Call later" is pressed, the lead's phone + status are
POSTed to an Apps Script web app (``CRM_SHEET_WEBHOOK_URL``). The sheet joins on the
phone number to see which ads bring leads that convert.

How it works (same hook style as ``app.services.admin_alerts``):
- ``after_flush`` snapshots each changed lead as it is being saved (so quick
  successive saves each keep their own status); ``after_commit`` hands the snapshots
  to a background task, so the member's save is never slowed down, broken or rolled back.
- The task stores one ``sheet_sync_outbox`` row per lead (own session), then tries to
  send. ``run_scheduled_delivery`` (every minute) retries failures with backoff and
  logs rows that give up after ``MAX_ATTEMPTS``.
- Rows for the same lead always go out oldest first, so a retried old status never
  overwrites a newer one in the sheet.

Switch off: leave ``CRM_SHEET_WEBHOOK_URL`` empty — every hook returns immediately.
The secret only ever leaves the server inside the webhook body.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import httpx
from sqlalchemy import delete, event as sa_event, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SASession

from app.core.config import settings
from app.core.lead_outcome import DROP_REASON_LABELS
from app.core.lead_status import LEAD_STATUS_LABELS
from app.core.person_name import person_name
from app.core.time_ist import IST
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.sheet_sync_outbox import SheetSyncOutbox
from app.models.user import User

logger = logging.getLogger(__name__)

MAX_BATCH = 200  # webhook contract: at most 200 leads per POST
MAX_ATTEMPTS = 5
RETRY_DELAYS_SECONDS = (60, 300, 900, 3600)  # wait after failed attempt 1, 2, 3, 4
DONE_ROW_RETENTION = timedelta(days=30)
HTTP_TIMEOUT_SECONDS = 30.0

_INFO_KEY = "sheet_sync_snapshots"
# Lead columns whose change means "send the new state to the sheet".
_WATCHED_LEAD_FIELDS = ("status", "call_status", "drop_reason")
_SNAPSHOT_FIELDS = (
    "id", "phone", "status", "call_status", "drop_reason", "notes", "drop_notes",
    "assigned_to_user_id", "deleted_at", "last_action_at", "created_at",
)

# Dial-outcome labels exactly as the team sees them (frontend/src/lib/call-status-options.ts).
CALL_STATUS_LABELS: dict[str, str] = {
    "not_called": "Not Called Yet",
    "call_received": "Call Received",
    "no_answer": "No Response",
    "call_cut": "Call Cut",
    "person_block": "Person Block",
    "interested": "Called - Interested",
    "not_interested": "Called - Not Interested",
    "follow_up": "Called - Follow Up",
    "called": "Called - Busy",
    "callback_requested": "Call Back",
    "video_sent": "Sent Day 1 Video",
    "converted": "Already / Converted",
}

# Calling-board buttons that leave the stage on Contacted; their only trace is the
# follow-up note written by LeadsService.apply_ctcs_action. Labels match admin alerts.
_BOARD_NOTE_PREFIXES: tuple[tuple[str, str], ...] = (
    ("CTCS: not picked", "Not picked"),
    ("CTCS: call later", "Call later"),
)

_background_tasks: set[asyncio.Task] = set()
_last_task: asyncio.Task | None = None  # outbox rows are stored one save after another, in commit order
_last_failure_at: datetime | None = None
_deliver_lock = asyncio.Lock()


class SheetSyncError(RuntimeError):
    pass


def enabled() -> bool:
    return bool((settings.crm_sheet_webhook_url or "").strip())


def normalize_phone(raw: str | None) -> str | None:
    """``91`` + 10 digits, digits only — or ``None`` when that's not possible."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):  # 0091 98765 43210
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):  # 09876543210
        digits = digits[1:]
    if len(digits) == 13 and digits.startswith("910"):  # +91 0 98765 43210
        digits = "91" + digits[3:]
    if len(digits) == 10:
        digits = "91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return None


def _label(labels: dict[str, str], slug: str) -> str:
    return labels.get(slug, slug.replace("_", " ").title())


def _ist_text(value: datetime) -> str:
    if value.tzinfo is None:  # SQLite hands back naive UTC
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")


# ── hooks ────────────────────────────────────────────────────────────────────


def _really_changed(history) -> bool:
    if not history.has_changes():
        return False
    if history.deleted and history.added:
        return history.deleted[0] != history.added[0]
    return True


def _snapshot(lead: Lead) -> dict[str, Any]:
    """The lead's columns as held in memory — never triggers a DB load (safe inside a flush)."""
    loaded = inspect(lead).dict
    snap = {f: loaded.get(f) for f in _SNAPSHOT_FIELDS}
    if "phone" not in loaded or "status" not in loaded:  # expired in memory → read it back later
        snap["reload"] = True
    return snap


def _board_label(note: str | None) -> str | None:
    for prefix, label in _BOARD_NOTE_PREFIXES:
        if (note or "").startswith(prefix):
            return label
    return None


@sa_event.listens_for(SASession, "after_flush")
def _capture_lead_changes(session: SASession, _ctx) -> None:
    if not enabled():
        return
    try:
        snaps: dict[int, dict[str, Any]] = session.info.setdefault(_INFO_KEY, {})
        for obj in session.new:
            if isinstance(obj, Lead) and obj.id is not None:
                snaps[int(obj.id)] = _snapshot(obj)
        for obj in session.dirty:
            if isinstance(obj, Lead) and obj.id is not None:
                state = inspect(obj)
                if any(_really_changed(state.attrs[f].history) for f in _WATCHED_LEAD_FIELDS):
                    snaps[int(obj.id)] = _snapshot(obj)
        for obj in session.new:
            label = _board_label(obj.note) if isinstance(obj, FollowUp) and obj.lead_id else None
            if label is None:
                continue
            lead_id = int(obj.lead_id)
            if lead_id not in snaps:
                lead = session.identity_map.get(inspect(Lead).identity_key_from_primary_key((lead_id,)))
                snaps[lead_id] = _snapshot(lead) if lead is not None else {"id": lead_id, "reload": True}
            snaps[lead_id]["board"] = label
    except Exception as exc:  # noqa: BLE001 — never break the member's save
        logger.warning("sheet_sync: capture failed: %s", exc)


@sa_event.listens_for(SASession, "after_rollback")
def _drop_on_rollback(session: SASession) -> None:
    session.info.pop(_INFO_KEY, None)


@sa_event.listens_for(SASession, "after_commit")
def _queue_after_commit(session: SASession) -> None:
    snaps = session.info.pop(_INFO_KEY, None)
    if not snaps or not enabled():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # sync scripts: no loop to run on; the backfill covers them
    global _last_task
    try:
        committed_at = datetime.now(timezone.utc)
        for snap in snaps.values():
            snap["committed_at"] = committed_at
        _last_task = _spawn(loop, _record_and_send(list(snaps.values()), after=_last_task))
    except Exception as exc:  # noqa: BLE001 — the save is already committed; never fail it
        logger.warning("sheet_sync: could not schedule: %s", exc)


def _spawn(loop: asyncio.AbstractEventLoop, coro) -> asyncio.Task:
    task = loop.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


def _session_factory():
    from app.db.session import get_session_factory

    return get_session_factory()()


async def _record_and_send(snapshots: list[dict[str, Any]], *, after: asyncio.Task | None = None) -> None:
    try:
        if after is not None and not after.done() and after.get_loop() is asyncio.get_running_loop():
            await asyncio.wait([after])  # an earlier save's rows must be stored first
        async with _session_factory() as session:
            rows = await build_payloads(session, snapshots)
            committed_at = {int(s["id"]): s.get("committed_at") for s in snapshots}
            for lead_id, payload in rows:
                session.add(
                    SheetSyncOutbox(
                        lead_id=lead_id,
                        payload=payload,
                        created_at=committed_at.get(lead_id) or datetime.now(timezone.utc),
                    )
                )
            await session.commit()
        # Send now unless a send is already running or the sheet just failed — then the
        # minute job picks these rows up. Sending is never awaited here, so a slow sheet
        # can't hold back storing the next save's rows.
        recently_failed = _last_failure_at and datetime.now(timezone.utc) - _last_failure_at < timedelta(minutes=1)
        if rows and not _deliver_lock.locked() and not recently_failed:
            _spawn(asyncio.get_running_loop(), deliver_pending())
    except Exception as exc:  # noqa: BLE001
        logger.warning("sheet_sync: could not queue leads %s: %s", [s.get("id") for s in snapshots], exc)


# ── payloads ─────────────────────────────────────────────────────────────────


async def build_payloads(
    session: AsyncSession,
    snapshots: Iterable[dict[str, Any]],
    *,
    use_last_action_time: bool = False,
) -> list[tuple[int, dict[str, Any]]]:
    """Webhook rows for these lead snapshots. Deleted leads and unusable phones are skipped (logged)."""
    snaps = list(snapshots)
    reload_ids = [int(s["id"]) for s in snaps if s.get("reload")]
    if reload_ids:
        fresh = {
            int(l.id): _snapshot(l)
            for l in (await session.execute(select(Lead).where(Lead.id.in_(reload_ids)))).scalars().all()
        }
        snaps = [{**fresh[int(s["id"])], "board": s.get("board"), "committed_at": s.get("committed_at")}
                 if s.get("reload") else s
                 for s in snaps if not s.get("reload") or int(s["id"]) in fresh]
    leads = [s for s in snaps if s.get("deleted_at") is None]
    if not leads:
        return []

    agent_ids = {int(l["assigned_to_user_id"]) for l in leads if l.get("assigned_to_user_id")}
    agents: dict[int, str] = {}
    if agent_ids:
        for uid, name, username in (
            await session.execute(select(User.id, User.name, User.username).where(User.id.in_(agent_ids)))
        ).all():
            agents[int(uid)] = person_name(name or username)

    # Last calling-board press, for Contacted leads whose snapshot didn't carry one.
    board_results: dict[int, str] = {}
    contacted = [int(l["id"]) for l in leads if l.get("status") == "contacted" and not l.get("board")]
    if contacted:
        notes = await session.execute(
            select(FollowUp.lead_id, FollowUp.note)
            .where(FollowUp.lead_id.in_(contacted))
            .order_by(FollowUp.lead_id, FollowUp.created_at.desc(), FollowUp.id.desc())
        )
        latest: dict[int, str] = {}
        for lead_id, note in notes.all():
            latest.setdefault(int(lead_id), note or "")
        for lead_id, note in latest.items():
            label = _board_label(note)
            if label:
                board_results[lead_id] = label

    now = datetime.now(timezone.utc)
    out: list[tuple[int, dict[str, Any]]] = []
    for lead in leads:
        lead_id = int(lead["id"])
        phone = normalize_phone(lead.get("phone"))
        if phone is None:
            logger.warning("sheet_sync: lead %s skipped — phone %r is not 91 + 10 digits", lead_id, lead.get("phone"))
            continue
        status = lead.get("status") or "new_lead"
        tags: list[str] = []
        if lead.get("call_status"):
            tags.append(_label(CALL_STATUS_LABELS, lead["call_status"]))
        board = lead.get("board") or (board_results.get(lead_id) if status == "contacted" else None)
        if board:
            tags.append(board)
        if status == "lost" and lead.get("drop_reason"):
            tags.append(_label(DROP_REASON_LABELS, lead["drop_reason"]))
        note = (lead.get("drop_notes") if status == "lost" and lead.get("drop_notes") else lead.get("notes")) or ""
        if use_last_action_time:
            when = lead.get("last_action_at") or lead.get("created_at") or now
        else:
            when = lead.get("committed_at") or now
        out.append(
            (
                lead_id,
                {
                    "phone": phone,
                    "status": _label(LEAD_STATUS_LABELS, status),
                    "agent": agents.get(int(lead.get("assigned_to_user_id") or 0), ""),
                    "note": note.strip()[:500],
                    "tags": tags,
                    "updated_at": _ist_text(when),
                },
            )
        )
    return out


# ── delivery ─────────────────────────────────────────────────────────────────


async def post_to_sheet(leads: list[dict[str, Any]], *, client: httpx.AsyncClient | None = None) -> int:
    """POST one batch; returns ``saved``. Raises ``SheetSyncError`` unless the sheet says ``ok``."""
    body = {"secret": settings.crm_sheet_webhook_secret, "leads": leads}
    own_client = client is None
    http = client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True)
    try:
        # Apps Script answers 302 → the result page; httpx follows it with a GET.
        response = await http.post(settings.crm_sheet_webhook_url.strip(), json=body)
    except httpx.HTTPError as exc:
        raise SheetSyncError(f"{type(exc).__name__}: {exc}") from exc
    finally:
        if own_client:
            await http.aclose()
    if response.status_code >= 400:
        raise SheetSyncError(f"HTTP {response.status_code}: {response.text[:200]}")
    try:
        data = response.json()
    except ValueError as exc:
        raise SheetSyncError(f"not JSON: {response.text[:200]}") from exc
    if not isinstance(data, dict) or data.get("ok") is not True:
        error = data.get("error") if isinstance(data, dict) else None
        raise SheetSyncError(f"sheet said not ok: {error or data}")
    return int(data.get("saved") or 0)


async def _claim_due(session: AsyncSession, now: datetime) -> list[SheetSyncOutbox]:
    """Up to ``MAX_BATCH`` due rows, oldest first; a lead waiting on a retry blocks its newer rows."""
    pending = (
        await session.execute(
            select(SheetSyncOutbox)
            .where(SheetSyncOutbox.status == "pending")
            .order_by(SheetSyncOutbox.created_at, SheetSyncOutbox.id)
            .limit(MAX_BATCH * 10)
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()
    blocked: set[int] = set()
    due: list[SheetSyncOutbox] = []
    for row in pending:
        when = row.next_attempt_at
        if when is not None and when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if row.lead_id in blocked or (when is not None and when > now):
            blocked.add(row.lead_id)
            continue
        due.append(row)
        if len(due) >= MAX_BATCH:
            break
    return due


async def _deliver_one_batch() -> int:
    global _last_failure_at
    now = datetime.now(timezone.utc)
    async with _session_factory() as session:
        rows = await _claim_due(session, now)
        if not rows:
            await session.rollback()
            return 0
        try:
            await post_to_sheet([dict(r.payload) for r in rows])
        except Exception as exc:  # noqa: BLE001
            for row in rows:
                row.attempts = int(row.attempts or 0) + 1
                row.last_error = str(exc)[:1000]
                if row.attempts >= MAX_ATTEMPTS:
                    row.status = "failed"
                else:
                    delay = RETRY_DELAYS_SECONDS[min(row.attempts, len(RETRY_DELAYS_SECONDS)) - 1]
                    row.next_attempt_at = now + timedelta(seconds=delay)
            _last_failure_at = now
            given_up = sum(1 for r in rows if r.status == "failed")
            await session.commit()
            logger.warning("sheet_sync: send of %d rows failed (%d gave up): %s", len(rows), given_up, exc)
            if given_up:
                logger.error("sheet_sync: %d rows marked failed after %d attempts", given_up, MAX_ATTEMPTS)
            return 0
        for row in rows:
            row.status = "done"
            row.sent_at = now
            row.attempts = int(row.attempts or 0) + 1
            row.last_error = None
        await session.commit()
        return len(rows)


async def deliver_pending(*, max_batches: int = 10) -> int:
    """Send due outbox rows (≤ 200 per POST). Returns rows delivered; never raises."""
    if not enabled():
        return 0
    sent = 0
    try:
        async with _deliver_lock:
            for _ in range(max_batches):
                n = await _deliver_one_batch()  # also picks up rows stored while it ran
                sent += n
                if n == 0:
                    break
    except Exception as exc:  # noqa: BLE001
        logger.warning("sheet_sync: delivery run failed: %s", exc)
    return sent


async def run_scheduled_delivery() -> None:
    """APScheduler job (every minute): retry due rows; once an hour prune old sent rows."""
    if not enabled():
        return
    sent = await deliver_pending()
    if sent:
        logger.info("sheet_sync: delivered %d rows", sent)
    if datetime.now(timezone.utc).minute == 0:
        try:
            async with _session_factory() as session:
                await session.execute(
                    delete(SheetSyncOutbox).where(
                        SheetSyncOutbox.status == "done",
                        SheetSyncOutbox.sent_at < datetime.now(timezone.utc) - DONE_ROW_RETENTION,
                    )
                )
                await session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("sheet_sync: prune failed: %s", exc)


async def requeue_failed() -> int:
    """Give rows that ran out of attempts a fresh start (used by the backfill script)."""
    async with _session_factory() as session:
        rows = (await session.execute(select(SheetSyncOutbox).where(SheetSyncOutbox.status == "failed"))).scalars().all()
        for row in rows:
            row.status = "pending"
            row.attempts = 0
            row.next_attempt_at = datetime.now(timezone.utc)
        await session.commit()
        return len(rows)


# ── backfill ─────────────────────────────────────────────────────────────────


async def backfill(*, days: int = 30, dry_run: bool = False) -> dict[str, int]:
    """Send the current status of every lead created in the last ``days`` days.

    Safe to repeat: the sheet upserts by phone. Goes straight to the webhook (not the
    outbox) so it reports exactly what was sent.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stats = {"leads": 0, "sent": 0, "skipped": 0, "failed_batches": 0}
    async with _session_factory() as session:
        ids = list(
            (
                await session.execute(
                    select(Lead.id).where(Lead.created_at >= since, Lead.deleted_at.is_(None)).order_by(Lead.id)
                )
            ).scalars().all()
        )
        stats["leads"] = len(ids)
        for start in range(0, len(ids), MAX_BATCH):
            chunk = ids[start : start + MAX_BATCH]
            chunk_leads = (await session.execute(select(Lead).where(Lead.id.in_(chunk)))).scalars().all()
            rows = await build_payloads(session, [_snapshot(l) for l in chunk_leads], use_last_action_time=True)
            stats["skipped"] += len(chunk) - len(rows)
            if not rows:
                continue
            batch = [payload for _, payload in rows]
            if dry_run:
                stats["sent"] += len(batch)
                logger.info("sheet_sync backfill (dry run) batch of %d, first: %s", len(batch), batch[0])
                continue
            for attempt in range(3):
                try:
                    await post_to_sheet(batch)
                    stats["sent"] += len(batch)
                    break
                except SheetSyncError as exc:
                    logger.warning("sheet_sync backfill: batch at %d failed (try %d/3): %s", start, attempt + 1, exc)
                    if attempt < 2:
                        await asyncio.sleep(2 ** (attempt + 1))
            else:
                stats["failed_batches"] += 1
    return stats
