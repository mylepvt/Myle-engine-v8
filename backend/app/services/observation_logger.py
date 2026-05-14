from __future__ import annotations

"""
Observation logger — production-safe structured logging with persistent sink.

Architecture:
─────────────
HTTP Request → AccessLogMiddleware → set_request_context(request_id)
    │
    ▼
Route → Service → session.commit()
    │                     │
    │              SQLAlchemy after_commit event → emit_observation()
    │                     │
    │                     ├─ enrich with request_id, service, commit, env
    │                     ├─ structured JSON → stdout (Render persistent log stream)
    │                     └─ async queue → drain loop → stdout (overflow protection)
    │
    ▼
Response

Activation:
───────────
Env vars:
  PHASE1_OBSERVATION_ENABLED=true     (default: false)
  PHASE1_OBSERVATION_SAMPLE_RATE=0.1  (range 0.0-1.0, default 0.1)
  PHASE1_OBS_LOG_FILE=/tmp/obs.log    (file fallback, default /tmp/phase1_observation.log)

Persistent sink (Render):
  - stdout logs captured by Render, retained 7+ days
  - Configure Log Stream → Papertrail/Logtail/Datadog for long-term retention
  - Log format: one JSON object per line (newline-delimited JSON)
"""

import asyncio
import contextvars
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session as SASession

from app.core.config import settings

# ── deployment identity ─────────────────────────────────────────────────
_COMMIT_SHA = os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("SOURCE_VERSION", "unknown")[:12]
_SERVICE_NAME = os.environ.get("RENDER_SERVICE_NAME", "unknown")
_ENV = settings.app_environment

# ── request context (propagated from middleware) ─────────────────────────
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("obs_request_id", default="")
_user_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("obs_user_id", default="")


def set_request_context(*, request_id: str = "", user_id: str = "") -> None:
    _request_id_ctx.set(request_id)
    _user_id_ctx.set(user_id)


def _request_id() -> str:
    return _request_id_ctx.get()


# ── persistent log sink ────────────────────────────────────────────────
# Primary: structured JSON to stdout (Render captures this permanently).
# Fallback: file handler for local debugging.
_OBS_LOG_FILE = os.environ.get("PHASE1_OBS_LOG_FILE", "/tmp/phase1_observation.log")
_QUEUE_MAXSIZE = 2000
_DRAIN_TIMEOUT = 0.5


class _JSONFormatter(logging.Formatter):
    """Outputs one clean JSON object per line — compatible with Logtail/Papertrail/Datadog."""
    def format(self, record: logging.LogRecord) -> str:
        raw = record.getMessage()
        # logger.info("PHASE1_OBS %s", json_str) → extract the json part
        if raw.startswith("PHASE1_OBS "):
            return raw[len("PHASE1_OBS "):]
        return raw


logger = logging.getLogger("observation")
if not logger.handlers:
    _stdout = logging.StreamHandler(sys.stdout)
    _stdout.setFormatter(_JSONFormatter())
    logger.addHandler(_stdout)
    _file = logging.FileHandler(_OBS_LOG_FILE, mode="a")
    _file.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_file)
    logger.setLevel(logging.INFO)
    logger.propagate = False

logger.info(json.dumps({
    "msg": "module_loaded",
    "phase": "observation_v1",
    "enabled": settings.phase1_observation_enabled,
    "sample_rate": settings.phase1_observation_sample_rate,
    "service": _SERVICE_NAME,
    "commit": _COMMIT_SHA,
    "env": _ENV,
    "log_file": _OBS_LOG_FILE,
}))

_queue: asyncio.Queue[dict[str, Any]] | None = None
_drain_task: asyncio.Task[None] | None = None


def generate_trace_id() -> str:
    return uuid.uuid4().hex[:12]


def correlation_id_for_lead(lead_id: int, version: int) -> str:
    return f"lead-{lead_id}-v{version}"


def should_sample_observation(
    *,
    lead_id: int,
    source: str,
    is_divergence: bool = False,
    is_failure: bool = False,
) -> bool:
    if is_divergence or is_failure:
        return True
    rate = settings.phase1_observation_sample_rate
    if rate >= 1.0:
        return True
    if rate <= 0.0:
        return False
    h = hash((lead_id, source)) & 0x7FFFFFFF
    return (h % 10000) < int(rate * 10000)


def _ensure_queue() -> asyncio.Queue[dict[str, Any]]:
    global _queue
    if _queue is None:
        _queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    return _queue


def _ensure_drain_task() -> asyncio.Task[None] | None:
    global _drain_task
    if _drain_task is None or _drain_task.done():
        try:
            _drain_task = asyncio.create_task(_drain_loop())
        except (RuntimeError, Exception):
            return None
    return _drain_task


def _enrich(record: dict[str, Any]) -> dict[str, Any]:
    rid = _request_id()
    if rid:
        record["request_id"] = rid
    record.setdefault("service", _SERVICE_NAME)
    record.setdefault("commit", _COMMIT_SHA)
    record.setdefault("env", _ENV)
    record.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    return record


def observe_event(*, event_type: str, lead_id: int | None = None, source: str, **extra: Any) -> None:
    """Enqueue a non-lead event observation (enrollment, wallet, scheduler)."""
    if not settings.phase1_observation_enabled:
        return
    record = _enrich({
        "metric": event_type,
        "lead_id": lead_id,
        "source": source,
        **extra,
    })
    _emit_json(json.dumps(record, default=str), record)


def emit_observation(record: dict[str, Any]) -> None:
    if not settings.phase1_observation_enabled:
        return
    line = json.dumps(_enrich(record), default=str)
    _emit_json(line, record)


def _emit_json(line: str, record: dict[str, Any]) -> None:
    # Primary: stdout (Render persistent log stream)
    logger.info("PHASE1_OBS %s", line)
    # Fallback: file
    try:
        with open(_OBS_LOG_FILE, "a") as _f:
            _f.write(f"{line}\n")
    except Exception:
        pass
    # Overflow protection: async queue
    try:
        q = _ensure_queue()
        _ensure_drain_task()
        if q.full():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
        q.put_nowait(record)
    except Exception:
        pass
    # Activity feed (SSE broadcast to admin dashboard)
    try:
        from app.services import activity_feed as _af
        import asyncio as _asyncio
        event_type = record.get("metric") or record.get("event_type") or "unknown"
        lead_id = record.get("lead_id")
        actor_id = record.get("actor_id") or record.get("user_id")
        loop = _af._get_event_loop()
        if loop and loop.is_running():
            _asyncio.ensure_future(
                _af.write_event(
                    event_type=str(event_type),
                    lead_id=int(lead_id) if lead_id else None,
                    actor_id=int(actor_id) if actor_id else None,
                    metadata=record,
                ),
                loop=loop,
            )
    except Exception:
        pass


async def _drain_loop() -> None:
    while True:
        try:
            record = await asyncio.wait_for(_queue.get(), timeout=_DRAIN_TIMEOUT)
            line = json.dumps(record, default=str)
            logger.info("PHASE1_OBS %s", line)
            _queue.task_done()
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break
        except Exception:
            continue


async def drain_observation_logger() -> None:
    global _drain_task
    if _drain_task is None:
        return
    remaining = _queue.qsize() if _queue is not None else 0
    if remaining > 0:
        try:
            await asyncio.wait_for(_queue.join(), timeout=2.0)
        except (asyncio.TimeoutError, Exception):
            pass
    _drain_task = None


# ── SQLAlchemy transaction boundary hook ──────────────────────────────────
# Fires after every session.commit(). Captures lead_id from the session's
# new/dirty/deleted Lead objects and emits an observation automatically.
_LEAD_TXN_METRIC = "commit_boundary"
_LEAD_TXN_SOURCE = "sa_after_commit"


@sa_event.listens_for(SASession, "after_commit")
def _after_commit_hook(session: SASession) -> None:
    """Automatic observation after every successful SQLAlchemy commit.

    Observes Lead changes across ALL code paths — not just those that
    explicitly call emit_observation(). Uses session.identity_map to
    find tracked Lead objects (safe with expire_on_commit=False).
    """
    if not settings.phase1_observation_enabled:
        return
    try:
        tracked = list(session.identity_map.values())
    except Exception:
        return
    for lead in tracked:
        try:
            tbl = getattr(lead, "__tablename__", None)
            if tbl != "leads":
                continue
            lead_id = lead.id
            if lead_id is None:
                continue
            if not should_sample_observation(lead_id=lead_id, source=_LEAD_TXN_SOURCE):
                continue
            emit_observation({
                "metric": _LEAD_TXN_METRIC,
                "trace_id": generate_trace_id(),
                "correlation_id": f"lead-{lead_id}-commit",
                "lead_id": lead_id,
                "source": _LEAD_TXN_SOURCE,
                "fastapi_stage": getattr(lead, "status", "") or "",
                "in_pool": bool(getattr(lead, "in_pool", False)),
            })
        except Exception:
            continue
