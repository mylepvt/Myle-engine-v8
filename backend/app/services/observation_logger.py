from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

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


# ── log file / queue config ─────────────────────────────────────────────
_OBS_LOG_FILE = os.environ.get("PHASE1_OBS_LOG_FILE", "/tmp/phase1_observation.log")
_QUEUE_MAXSIZE = 2000
_DRAIN_TIMEOUT = 0.5

logger = logging.getLogger("observation")
if not logger.handlers:
    _handler = logging.FileHandler(_OBS_LOG_FILE, mode="a")
    _handler.setFormatter(logging.Formatter("%(asctime)s PHASE1_OBSERVATION %(message)s"))
    logger.addHandler(_handler)
    _fallback = logging.StreamHandler(sys.stdout)
    _fallback.setFormatter(logging.Formatter("%(asctime)s PHASE1_OBSERVATION %(message)s"))
    logger.addHandler(_fallback)
    logger.setLevel(logging.INFO)
    logger.propagate = False

logger.info("module_loaded enabled=%s sample_rate=%s service=%s commit=%s env=%s",
            settings.phase1_observation_enabled,
            settings.phase1_observation_sample_rate,
            _SERVICE_NAME,
            _COMMIT_SHA,
            _ENV)

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
    logger.info("PHASE1_OBS %s", line)
    try:
        with open(_OBS_LOG_FILE, "a") as _f:
            _f.write(f"PHASE1_OBS {line}\n")
    except Exception:
        pass
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


async def _drain_loop() -> None:
    while True:
        try:
            record = await asyncio.wait_for(_queue.get(), timeout=_DRAIN_TIMEOUT)
            logger.info("PHASE1_OBS %s", json.dumps(record, default=str))
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
