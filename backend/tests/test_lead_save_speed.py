"""Lead-save latency guards: bounded concurrent broadcast + throttled list maintenance."""
from __future__ import annotations

import asyncio
import time
from datetime import timedelta

import pytest

from app.core import realtime_hub
from app.core.realtime_hub import RealtimeHub
from app.services import leads_service


class _Socket:
    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay
        self.sent: list[str] = []

    async def send_text(self, text: str) -> None:
        await asyncio.sleep(self.delay)
        self.sent.append(text)


async def test_one_slow_phone_does_not_hold_up_the_broadcast(monkeypatch):
    monkeypatch.setattr(realtime_hub, "_SEND_TIMEOUT_S", 0.2)
    hub = RealtimeHub()
    fast = [_Socket() for _ in range(30)]
    slow = _Socket(delay=5)
    for i, ws in enumerate([*fast, slow]):
        hub._by_user.setdefault(i, set()).add(ws)

    started = time.monotonic()
    await hub.broadcast_topics(["leads"])
    elapsed = time.monotonic() - started

    assert elapsed < 1.0  # was: sum of every socket's send time, unbounded
    assert all(len(ws.sent) == 1 for ws in fast)
    assert slow.sent == []  # timed out, skipped


async def test_list_maintenance_runs_at_most_once_a_minute(monkeypatch):
    calls: list[str] = []

    async def fake_archive(_session):
        calls.append("archive")
        return {}

    async def fake_seat(_session):
        calls.append("seat")
        return 0

    monkeypatch.setattr(leads_service, "run_completed_watch_pipeline_maintenance", fake_archive)
    monkeypatch.setattr(leads_service, "expire_stale_seat_holds", fake_seat)
    monkeypatch.setattr(leads_service, "_last_list_maintenance", {})

    class _Session:
        bind = object()

    session = _Session()
    for _ in range(5):
        await leads_service._maybe_run_list_maintenance(session)
    assert calls == ["archive", "seat"]

    key = id(session.bind)
    leads_service._last_list_maintenance[key] -= timedelta(seconds=61)
    await leads_service._maybe_run_list_maintenance(session)
    assert calls == ["archive", "seat", "archive", "seat"]


@pytest.fixture(autouse=True)
def _isolate_throttle(monkeypatch):
    monkeypatch.setattr(leads_service, "_last_list_maintenance", {})
