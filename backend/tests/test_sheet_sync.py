"""Google Sheet lead-status sync: phone format, hooks on create / status change, failure safety."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.config import settings
from app.db.base import Base
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.sheet_sync_outbox import SheetSyncOutbox
from app.models.user import User
from app.services import sheet_sync


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("9876543210", "919876543210"),
        ("+91 98765-43210", "919876543210"),
        ("09876543210", "919876543210"),
        ("919876543210", "919876543210"),
        ("0091 98765 43210", "919876543210"),
        ("+91 098765 43210", "919876543210"),
        (" 98765 43210 ", "919876543210"),
        ("12345", None),
        ("", None),
        (None, None),
        ("+1 415 555 0100", None),
        ("98765432101", None),
    ],
)
def test_normalize_phone(raw, expected):
    assert sheet_sync.normalize_phone(raw) == expected


@pytest.fixture(autouse=True)
def _fresh_module_state(monkeypatch):
    monkeypatch.setattr(sheet_sync, "_last_task", None)
    monkeypatch.setattr(sheet_sync, "_last_failure_at", None)


@pytest.fixture
async def Session(monkeypatch):
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "https://script.example/exec")
    monkeypatch.setattr(settings, "crm_sheet_webhook_secret", "s3cret")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(sheet_sync, "_session_factory", factory)
    async with factory() as s:
        s.add(User(id=1, email="rahul@test.myle", role="team", name="rahul_kumar", fbo_id="F1"))
        await s.commit()
    yield factory
    await engine.dispose()


@pytest.fixture
def sent(monkeypatch):
    """Capture webhook batches instead of calling the network."""
    batches: list[list[dict]] = []

    async def fake_post(leads, *, client=None):
        batches.append(leads)
        return len(leads)

    monkeypatch.setattr(sheet_sync, "post_to_sheet", fake_post)
    return batches


async def _settle() -> None:
    for _ in range(20):
        if not sheet_sync._background_tasks:
            return
        await asyncio.gather(*list(sheet_sync._background_tasks), return_exceptions=True)


async def _new_lead(Session, **kw) -> int:
    async with Session() as s:
        lead = Lead(name="Neha", created_by_user_id=1, assigned_to_user_id=1, phone="+91 98851-06228", **kw)
        s.add(lead)
        await s.commit()
        return lead.id


async def test_fires_on_create_and_status_change(Session, sent):
    lead_id = await _new_lead(Session, notes="call back tomorrow")
    await _settle()
    assert len(sent) == 1
    row = sent[0][0]
    assert row["phone"] == "919885106228"
    assert row["status"] == "New Lead"
    assert row["agent"] == "Rahul Kumar"
    assert row["note"] == "call back tomorrow"
    assert row["tags"] == ["Not Called Yet"]
    assert len(row["updated_at"]) == 19  # yyyy-MM-dd HH:mm:ss

    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        lead.status = "lost"
        lead.drop_reason = "wrong_number"
        lead.call_status = "no_answer"
        await s.commit()
    await _settle()
    assert len(sent) == 2
    assert sent[1][0]["status"] == "Lost"
    assert sent[1][0]["tags"] == ["No Response", "Wrong Number"]


async def test_unrelated_edit_and_rollback_do_not_fire(Session, sent):
    lead_id = await _new_lead(Session)
    await _settle()
    sent.clear()
    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        lead.city = "Delhi"
        lead.status = lead.status  # same value — not a change
        await s.commit()
    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        lead.status = "contacted"
        await s.flush()
        await s.rollback()
    await _settle()
    assert sent == []


async def test_calling_board_not_picked_fires_with_tag(Session, sent):
    lead_id = await _new_lead(Session, status="contacted")
    await _settle()
    sent.clear()
    async with Session() as s:
        s.add(FollowUp(lead_id=lead_id, note="CTCS: not picked — retry after 2h", created_by_user_id=1))
        await s.commit()
    await _settle()
    assert sent[0][0]["status"] == "Contacted"
    assert "Not picked" in sent[0][0]["tags"]


async def test_webhook_failure_never_breaks_save_and_retries(Session, monkeypatch):
    calls = {"n": 0}

    async def boom(leads, *, client=None):
        calls["n"] += 1
        raise sheet_sync.SheetSyncError("sheet down")

    monkeypatch.setattr(sheet_sync, "post_to_sheet", boom)
    lead_id = await _new_lead(Session)  # must not raise
    await _settle()
    assert calls["n"] == 1

    async with Session() as s:
        assert (await s.get(Lead, lead_id)) is not None
        row = (await s.execute(select(SheetSyncOutbox))).scalar_one()
        assert row.status == "pending"
        assert row.attempts == 1
        assert "sheet down" in row.last_error

    # Not due yet → the minute job leaves it alone.
    await sheet_sync.run_scheduled_delivery()
    assert calls["n"] == 1

    # Due again and the sheet is back → delivered.
    async with Session() as s:
        row = (await s.execute(select(SheetSyncOutbox))).scalar_one()
        row.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await s.commit()
    delivered: list = []

    async def ok(leads, *, client=None):
        delivered.extend(leads)
        return len(leads)

    monkeypatch.setattr(sheet_sync, "post_to_sheet", ok)
    await sheet_sync.run_scheduled_delivery()
    assert [d["phone"] for d in delivered] == ["919885106228"]
    async with Session() as s:
        assert (await s.execute(select(SheetSyncOutbox))).scalar_one().status == "done"


async def test_gives_up_after_max_attempts(Session, monkeypatch):
    async def boom(leads, *, client=None):
        raise sheet_sync.SheetSyncError("sheet down")

    monkeypatch.setattr(sheet_sync, "post_to_sheet", boom)
    await _new_lead(Session)
    await _settle()
    for _ in range(sheet_sync.MAX_ATTEMPTS):
        async with Session() as s:
            row = (await s.execute(select(SheetSyncOutbox))).scalar_one()
            row.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await s.commit()
        await sheet_sync.deliver_pending()
    async with Session() as s:
        row = (await s.execute(select(SheetSyncOutbox))).scalar_one()
        assert row.status == "failed"
        assert row.attempts == sheet_sync.MAX_ATTEMPTS


async def test_older_retry_blocks_newer_row_for_same_lead(Session, monkeypatch):
    async def boom(leads, *, client=None):
        raise sheet_sync.SheetSyncError("sheet down")

    monkeypatch.setattr(sheet_sync, "post_to_sheet", boom)
    lead_id = await _new_lead(Session)
    await _settle()

    batches: list = []

    async def ok(leads, *, client=None):
        batches.append(leads)
        return len(leads)

    monkeypatch.setattr(sheet_sync, "post_to_sheet", ok)
    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        lead.status = "contacted"
        await s.commit()
    await _settle()
    assert batches == []  # newer "Contacted" waits behind the failed "New Lead"


async def test_bad_phone_is_skipped_not_sent(Session, sent):
    async with Session() as s:
        s.add(Lead(name="X", created_by_user_id=1, phone="12345"))
        await s.commit()
    await _settle()
    assert sent == []


async def test_disabled_without_url(Session, sent, monkeypatch):
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "")
    await _new_lead(Session)
    await _settle()
    assert sent == []
    async with Session() as s:
        assert (await s.execute(select(SheetSyncOutbox))).first() is None


async def test_post_to_sheet_follows_redirect_and_checks_ok(monkeypatch):
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "https://script.example/exec")
    monkeypatch.setattr(settings, "crm_sheet_webhook_secret", "s3cret")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/exec":
            return httpx.Response(302, headers={"location": "https://echo.example/result"})
        return httpx.Response(200, json={"ok": True, "saved": 1})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as client:
        assert await sheet_sync.post_to_sheet([{"phone": "919876543210", "status": "New Lead"}], client=client) == 1
    assert b'"secret":"s3cret"' in seen[0].content.replace(b" ", b"")

    def not_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": False, "error": "bad secret"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(not_ok)) as client:
        with pytest.raises(sheet_sync.SheetSyncError, match="bad secret"):
            await sheet_sync.post_to_sheet([{"phone": "919876543210", "status": "New Lead"}], client=client)


async def test_backfill_batches_of_200(Session, monkeypatch):
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "")  # keep live hooks quiet while seeding
    async with Session() as s:
        for i in range(450):
            s.add(Lead(name=f"L{i}", created_by_user_id=1, phone=f"98{i:08d}"))
        s.add(Lead(name="old", created_by_user_id=1, phone="9811111111",
                   created_at=datetime.now(timezone.utc) - timedelta(days=45)))
        await s.commit()
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "https://script.example/exec")
    batches: list = []

    async def ok(leads, *, client=None):
        batches.append(leads)
        return len(leads)

    monkeypatch.setattr(sheet_sync, "post_to_sheet", ok)
    stats = await sheet_sync.backfill(days=30)
    assert [len(b) for b in batches] == [200, 200, 50]
    assert stats == {"leads": 450, "sent": 450, "skipped": 0, "failed_batches": 0}


async def test_real_api_create_and_status_change_fire(admin_client, engine, monkeypatch):
    """End to end through the real routes: POST /leads and PATCH status both reach the sheet.

    The shared test DB runs every session on one SQLite connection, so the background
    step is replayed after each request instead of racing the request's own session.
    """
    monkeypatch.setattr(settings, "crm_sheet_webhook_url", "https://script.example/exec")
    monkeypatch.setattr(
        sheet_sync, "_session_factory", async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    )
    captured: list = []
    real_record = sheet_sync._record_and_send

    async def capture(snapshots, *, after=None):
        captured.append(snapshots)

    monkeypatch.setattr(sheet_sync, "_record_and_send", capture)
    batches: list = []

    async def ok(leads, *, client=None):
        batches.append(leads)
        return len(leads)

    monkeypatch.setattr(sheet_sync, "post_to_sheet", ok)

    async def replay():
        await _settle()
        while captured:
            await real_record(captured.pop(0))
        await _settle()  # the send itself runs as its own task

    r = await admin_client.post("/api/v1/leads", json={"name": "Sheet Sync", "status": "new_lead", "phone": "9139990001"})
    assert r.status_code == 201, r.text
    await replay()
    r = await admin_client.patch(f"/api/v1/leads/{r.json()['id']}", json={"status": "contacted"})
    assert r.status_code == 200, r.text
    await replay()
    mine = [row for batch in batches for row in batch if row["phone"] == "919139990001"]
    assert [row["status"] for row in mine] == ["New Lead", "Contacted"]


async def test_quick_successive_saves_keep_each_status(Session, sent):
    """Create + immediate status change: History must see New Lead, then Contacted."""
    async with Session() as s:
        lead = Lead(name="Neha", created_by_user_id=1, phone="9885106228")
        s.add(lead)
        await s.commit()
        lead.status = "contacted"
        await s.commit()
    await _settle()
    assert [row["status"] for batch in sent for row in batch] == ["New Lead", "Contacted"]


async def test_expired_lead_is_read_back(Session, sent):
    lead_id = await _new_lead(Session)
    await _settle()
    sent.clear()
    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        s.expire(lead, ["phone"])
        lead.status = "invited"
        await s.commit()
    await _settle()
    assert [(r["phone"], r["status"]) for b in sent for r in b] == [("919885106228", "Invited")]
