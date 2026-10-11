"""Lead claims: one debit + one invoice per claim, the wallet never goes negative, a double-tap
never charges twice, a released lead can be claimed again, and the old self-credit holes are gone."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services.wallet_guard import ensure_not_negative, wallet_balance_cents

A, LEADER, ADMIN = 7601, 7602, 7600
PRICE = 1666  # ₹16.66


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F07600", email="a@t.myle", role="admin", name="Admin"),
            User(id=A, fbo_id="F07601", email="m@t.myle", role="team", name="Asha"),
            User(id=LEADER, fbo_id="F07602", email="l@t.myle", role="leader", name="Lalit"),
        ])
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    who = {"user": AuthUser(user_id=A, role="team", email="m@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session, who
    app.dependency_overrides = saved
    await engine.dispose()


async def _pool(Session, n: int) -> list[int]:
    async with Session() as s:
        leads = [Lead(name=f"Pool {i}", status="new_lead", created_by_user_id=ADMIN, in_pool=True,
                      pool_type="paid", pool_price_cents=PRICE, outcome="active") for i in range(n)]
        s.add_all(leads)
        await s.commit()
        return [lead.id for lead in leads]


async def _topup(Session, user_id: int, cents: int) -> None:
    async with Session() as s:
        s.add(WalletLedgerEntry(user_id=user_id, amount_cents=cents, currency="INR",
                                idempotency_key=f"test_topup_{user_id}_{cents}", note="test"))
        await s.commit()


async def _counts(Session, user_id: int) -> tuple[int, int, int]:
    async with Session() as s:
        debits = (await s.execute(select(func.count()).select_from(WalletLedgerEntry).where(
            WalletLedgerEntry.user_id == user_id, WalletLedgerEntry.amount_cents < 0))).scalar_one()
        invoices = (await s.execute(select(func.count()).select_from(Invoice).where(
            Invoice.user_id == user_id, Invoice.doc_type == "tax_invoice"))).scalar_one()
        return debits, invoices, await wallet_balance_cents(s, user_id)


async def test_batch_claim_bills_every_lead_once_and_matches_the_wallet(ctx):
    client, Session, _who = ctx
    ids = await _pool(Session, 3)
    await _topup(Session, A, 10_000)
    r = await client.post("/api/v1/lead-pool/claim", json={"count": 3, "client_key": "tap-1"})
    assert r.status_code == 200, r.text
    debits, invoices, balance = await _counts(Session, A)
    assert (debits, invoices, balance) == (3, 1, 10_000 - 3 * PRICE)
    async with Session() as s:
        inv = (await s.execute(select(Invoice))).scalar_one()
        assert inv.total_cents == 3 * PRICE
        assert [line["lead_ref"] for line in inv.payload_json["lines"]] == [f"Lead #{i}" for i in ids]


async def test_double_tap_with_the_same_key_never_charges_twice(ctx):
    client, Session, _who = ctx
    await _pool(Session, 4)
    await _topup(Session, A, 10_000)
    assert (await client.post("/api/v1/lead-pool/claim", json={"count": 2, "client_key": "tap-1"})).status_code == 200
    again = await client.post("/api/v1/lead-pool/claim", json={"count": 2, "client_key": "tap-1"})
    assert again.status_code == 409
    assert (await _counts(Session, A))[:2] == (2, 1)
    # A new tap (new key) is a new claim.
    assert (await client.post("/api/v1/lead-pool/claim", json={"count": 2, "client_key": "tap-2"})).status_code == 200
    assert (await _counts(Session, A))[:2] == (4, 2)


async def test_not_enough_money_charges_nothing(ctx):
    client, Session, _who = ctx
    await _pool(Session, 3)
    await _topup(Session, A, 2 * PRICE)
    r = await client.post("/api/v1/lead-pool/claim", json={"count": 3})
    assert r.status_code == 402
    assert await _counts(Session, A) == (0, 0, 2 * PRICE)


async def test_a_released_lead_can_be_claimed_again_by_the_same_member(ctx):
    client, Session, _who = ctx
    [lead_id] = await _pool(Session, 1)
    await _topup(Session, A, 10_000)
    assert (await client.post("/api/v1/lead-pool/claim", json={"count": 1})).status_code == 200
    async with Session() as s:  # admin puts it back in the pool
        lead = await s.get(Lead, lead_id)
        lead.in_pool, lead.owner_user_id, lead.assigned_to_user_id = True, None, None
        await s.commit()
    r = await client.post("/api/v1/lead-pool/claim", json={"count": 1})
    assert r.status_code == 200, r.text  # used to be a 500 (duplicate debit key)
    async with Session() as s:
        keys = sorted((await s.execute(select(WalletLedgerEntry.idempotency_key).where(
            WalletLedgerEntry.amount_cents < 0))).scalars())
    assert keys == [f"pool_claim_{lead_id}_{A}", f"pool_claim_{lead_id}_{A}_2"]
    assert (await _counts(Session, A))[:2] == (2, 2)


async def test_admin_single_claim_invoice_names_the_real_lead(ctx):
    client, Session, who = ctx
    [lead_id] = await _pool(Session, 1)
    await _topup(Session, ADMIN, 10_000)
    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    assert (await client.post(f"/api/v1/leads/{lead_id}/claim")).status_code == 200
    async with Session() as s:
        inv = (await s.execute(select(Invoice))).scalar_one()
    assert inv.payload_json["lines"][0]["lead_ref"] == f"Lead #{lead_id}"  # not "Lead #1"


async def test_last_guard_refuses_a_negative_wallet(ctx):
    _client, Session, _who = ctx
    async with Session() as s:
        s.add(WalletLedgerEntry(user_id=A, amount_cents=-1, currency="INR", idempotency_key="x", note="x"))
        with pytest.raises(HTTPException) as err:
            await ensure_not_negative(s, A)
        assert err.value.status_code == 402


async def test_self_credit_holes_are_closed(ctx):
    client, Session, who = ctx
    [lead_id] = await _pool(Session, 1)
    r = await client.post("/api/v1/wallet/enhanced/lead-claim",
                          json={"lead_id": lead_id, "lead_price_cents": -1_000_000})
    assert r.status_code in (404, 405)
    who["user"] = AuthUser(user_id=LEADER, role="leader", email="l@t.myle")
    r = await client.post("/api/v1/wallet/enhanced/lead-refund",
                          params={"lead_id": lead_id, "refund_amount_cents": 99_999_999, "reason": "x"})
    assert r.status_code in (404, 405)
    async with Session() as s:
        assert await wallet_balance_cents(s, A) == 0
        assert await wallet_balance_cents(s, LEADER) == 0
