"""Myle Bridge: signatures, Ledger → pool ingest, and lead events back to the Ledger."""
from __future__ import annotations

import json
import time

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.config import settings
from app.db.base import Base
from app.models.lead import Lead
from app.models.ledger_bridge_outbox import LedgerBridgeOutbox
from app.models.user import User
from app.services import ledger_bridge

SECRET = "b" * 40


@pytest.fixture(autouse=True)
def _bridge_on(monkeypatch):
    monkeypatch.setattr(settings, "myle_bridge_secret", SECRET)
    monkeypatch.setattr(settings, "ledger_bridge_url", "https://ledger.example/")


def _signed(body: dict) -> tuple[bytes, dict[str, str]]:
    raw = json.dumps(body).encode()
    return raw, ledger_bridge.signed_headers(raw)


# ── signatures ───────────────────────────────────────────────────────────────


def test_signature_matches_ledger_format():
    # lib/bridge/core.ts: hex(HMAC-SHA256(secret, "<ts>.<body>"))
    import hashlib
    import hmac

    body = b'{"a":1}'
    assert ledger_bridge.sign(SECRET, 1000, body) == hmac.new(SECRET.encode(), b"1000." + body, hashlib.sha256).hexdigest()


def test_verify_rejects_tampering_staleness_and_weak_secret(monkeypatch):
    body = b'{"a":1}'
    h = ledger_bridge.signed_headers(body)
    ts, sig = h["X-Myle-Timestamp"], h["X-Myle-Signature"]
    assert ledger_bridge.verify(ts, sig, body)
    assert ledger_bridge.verify(ts, sig.upper(), body)
    assert not ledger_bridge.verify(ts, sig, b'{"a":2}')
    assert not ledger_bridge.verify(ts, sig, body, now=time.time() + 301)
    assert not ledger_bridge.verify(None, sig, body)
    assert not ledger_bridge.verify("x", sig, body)
    monkeypatch.setattr(settings, "myle_bridge_secret", "short")
    assert not ledger_bridge.verify(ts, sig, body)


# ── Ledger → pool ────────────────────────────────────────────────────────────


async def test_pool_ingest_adds_each_lead_once(anon_client, engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        if not (await s.execute(select(User).where(User.role == "admin"))).first():
            s.add(User(id=9101, email="bridge-admin@test.myle", role="admin", name="bridge_admin", fbo_id="FBRIDGE"))
            await s.commit()

    batch = {
        "batch_id": "b1",
        "leads": [
            {"myle_lead_id": "bridge-k1", "submitted_at": "2026-10-19T10:00:00.000Z", "name": "Asha", "age": "25",
             "gender": "Female", "phone": "919876500001", "city": "Pune", "ad_name": "G5"},
            {"myle_lead_id": "bridge-k2", "name": "", "phone": "9876500002"},
            {"myle_lead_id": "bridge-bad", "name": "X", "phone": "12345"},
            {"name": "no ref", "phone": "919876500003"},
        ],
    }
    raw, headers = _signed(batch)
    r = await anon_client.post("/api/v1/bridge/pool-ingest", content=raw, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "received": 2, "created": 2, "skipped": 0}

    raw, headers = _signed(batch)
    r = await anon_client.post("/api/v1/bridge/pool-ingest", content=raw, headers=headers)
    assert r.json()["created"] == 0 and r.json()["skipped"] == 2

    async with factory() as s:
        leads = (await s.execute(select(Lead).where(Lead.external_ref.like("bridge-%")).order_by(Lead.id))).scalars().all()
    assert [l.external_ref for l in leads] == ["bridge-k1", "bridge-k2"]
    assert all(l.in_pool and l.assigned_to_user_id is None for l in leads)
    assert leads[0].phone == "919876500001" and leads[0].ad_name == "G5"
    assert leads[1].name == "Lead" and leads[1].phone == "919876500002"


async def test_pool_ingest_refuses_bad_signature(anon_client):
    raw, headers = _signed({"leads": []})
    headers["X-Myle-Signature"] = "0" * 64
    r = await anon_client.post("/api/v1/bridge/pool-ingest", content=raw, headers=headers)
    assert r.status_code == 401
    r = await anon_client.post("/api/v1/bridge/pool-ingest", content=raw)
    assert r.status_code == 401


# ── events back to the Ledger ────────────────────────────────────────────────


@pytest.fixture
async def Session(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(ledger_bridge, "_session_factory", factory)
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "")
    yield factory
    await engine.dispose()


async def _outbox(Session) -> list[dict]:
    async with Session() as s:
        return [r.payload for r in (await s.execute(select(LedgerBridgeOutbox).order_by(LedgerBridgeOutbox.id))).scalars()]


async def test_claim_and_stage_change_queue_events_in_the_same_save(Session):
    async with Session() as s:
        s.add(Lead(id=1, name="Asha", created_by_user_id=1, phone="919876500001", in_pool=True, pool_price_cents=4500, external_ref="k1"))
        s.add(Lead(id=2, name="Not bridged", created_by_user_id=1, phone="919876500002", in_pool=True))
        await s.commit()
    assert await _outbox(Session) == []  # creating a bridged lead is not an event

    async with Session() as s:
        for lead_id in (1, 2):
            lead = await s.get(Lead, lead_id)
            lead.in_pool = False
            lead.assigned_to_user_id = 7
        await s.commit()
    events = await _outbox(Session)
    assert [e["type"] for e in events] == ["lead.claimed"]
    assert events[0]["myle_lead_id"] == "k1" and events[0]["amount_paise"] == 4500

    async with Session() as s:
        lead = await s.get(Lead, 1)
        lead.status = "lost"
        await s.commit()
    events = await _outbox(Session)
    assert events[-1]["type"] == "lead.status_changed" and events[-1]["status"] == "lost"
    assert events[-1]["status_label"]

    # A rolled-back change sends nothing.
    async with Session() as s:
        lead = await s.get(Lead, 1)
        lead.status = "new_lead"
        await s.flush()
        await s.rollback()
    assert len(await _outbox(Session)) == 2


async def test_delivery_posts_signed_batch_and_retries(Session):
    async with Session() as s:
        s.add(Lead(id=1, name="Asha", created_by_user_id=1, phone="919876500001", in_pool=True, external_ref="k1"))
        await s.commit()
    async with Session() as s:
        lead = await s.get(Lead, 1)
        lead.status = "lost"
        await s.commit()

    seen: list[httpx.Request] = []
    answer = {"code": 500}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(answer["code"], json={"ok": answer["code"] == 200})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await ledger_bridge.deliver_pending(client=client) == 0
        async with Session() as s:
            row = (await s.execute(select(LedgerBridgeOutbox))).scalar_one()
            assert row.status == "pending" and row.attempts == 1 and row.last_error
            row.next_attempt_at = row.created_at  # due again now
            await s.commit()

        answer["code"] = 200
        assert await ledger_bridge.deliver_pending(client=client) == 1
        assert await ledger_bridge.deliver_pending(client=client) == 0

    req = seen[-1]
    assert str(req.url) == "https://ledger.example/api/bridge/events"
    assert ledger_bridge.verify(req.headers["x-myle-timestamp"], req.headers["x-myle-signature"], req.content)
    assert json.loads(req.content)["events"][0]["myle_lead_id"] == "k1"
    async with Session() as s:
        assert (await s.execute(select(LedgerBridgeOutbox))).scalar_one().status == "sent"


async def test_off_without_secret(Session, monkeypatch):
    monkeypatch.setattr(settings, "myle_bridge_secret", "")
    async with Session() as s:
        s.add(Lead(id=1, name="Asha", created_by_user_id=1, phone="919876500001", in_pool=True, external_ref="k1"))
        await s.commit()
        lead = await s.get(Lead, 1)
        lead.status = "lost"
        await s.commit()
    assert await _outbox(Session) == []
