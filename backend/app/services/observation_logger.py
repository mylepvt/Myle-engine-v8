from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from typing import Any

from app.core.config import settings

_OBS_LOG_FILE = os.environ.get("PHASE1_OBS_LOG_FILE", "/tmp/phase1_observation.log")

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

logger.info("module_loaded enabled=%s sample_rate=%s queue_maxsize=%s log_file=%s",
            settings.phase1_observation_enabled,
            settings.phase1_observation_sample_rate,
            _QUEUE_MAXSIZE,
            _OBS_LOG_FILE)

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


def emit_observation(record: dict[str, Any]) -> None:
    logger.info("EMIT_OBS_CALLED flag=%s", settings.phase1_observation_enabled)
    if not settings.phase1_observation_enabled:
        return
    line = json.dumps(record, default=str)
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
