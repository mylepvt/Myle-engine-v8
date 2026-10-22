"""Paid and free lead records at every hand-over, and the leader's leads-taken report."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.lead_claim_record import LeadClaimRecord
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry

ADMIN, LEADER, A, OUT = 7700, 7701, 7702, 7703
PRICE = 4500


@pytest.fixture
async def ctx(monkeypatch):
    from main import app

    async def _no_push(*_a, **_k):
        return None

    import app.api.v1.lead_pool as lead_pool_api

    monkeypatch.setattr(lead_pool_api, "send_push_to_user_bg", _no_push)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F7700", email="a@t.myle", role="admin", name="Admin"),
            User(id=LEADER, fbo_id="F7701", email="l@t.myle", role="leader", name="Pushpinder"),
            User(id=A, fbo_id="F7702", email="m@t.myle", role="team", name="Asha", upline_user_id=LEADER),
            User(id=OUT, fbo_id="F7703", email="o@t.myle", role="team", name="Other"),
        ])
        s.add(WalletLedgerEntry(user_id=A, amount_cents=100_000, currency="INR", idempotency_key="t_topup", note="test"))
        # Oldest first: a ₹0 pool lead, then paid ones.
        s.add(Lead(name="Zero", status="new_lead", created_by_user_id=ADMIN, in_pool=True, pool_type="paid",
                   pool_price_cents=0, outcome="active"))
        await s.flush()
        s.add_all(
            [Lead(name=f"Paid {i}", status="new_lead", created_by_user_id=ADMIN, in_pool=True, pool_type="paid",
                  pool_price_cents=PRICE, outcome="active") for i in range(4)]
        )
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


def _as(who, uid, role):
    who["user"] = AuthUser(user_id=uid, role=role, email=f"{uid}@t.myle")


async def test_every_hand_over_is_recorded_paid_or_free(ctx):
    client, Session, who = ctx
    assert (await client.post("/api/v1/lead-pool/claim", json={"count": 3})).status_code == 200

    _as(who, ADMIN, "admin")
    r = await client.post("/api/v1/lead-pool/give-free", json={"user_id": A, "count": 2, "reason": "New joiner"})
    assert r.status_code == 200, r.text

    async with Session() as s:
        recs = (await s.execute(select(LeadClaimRecord).where(LeadClaimRecord.user_id == A))).scalars().all()
        inv = (await s.execute(select(Invoice).where(Invoice.user_id == A, Invoice.doc_type == "tax_invoice"))).scalar_one()
    by = sorted((r.kind, r.source, r.price_cents, r.reason, r.given_by_user_id) for r in recs)
    assert by == sorted([
        ("paid", "pool", PRICE, None, None),
        ("paid", "pool", PRICE, None, None),
        ("free", "free_pool", 0, None, None),
        ("free", "admin_gift", 0, "New joiner", ADMIN),
        ("free", "admin_gift", 0, "New joiner", ADMIN),
    ])

    lead_ids = [int(line["lead_ref"].split("#")[1]) for line in inv.payload_json["lines"]]
    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund", json={"lead_ids": lead_ids[:1], "reason": "Bad number"})
    assert r.status_code == 200, r.text

    # The leader's report.
    _as(who, LEADER, "leader")
    rep = (await client.get("/api/v1/team/my-team/claims", params={"period": "today"})).json()
    t = rep["totals"]
    assert (t["taken"], t["paid"], t["free"], t["free_admin"], t["free_pool"]) == (5, 2, 3, 2, 1)
    assert t["paid_cents"] == 2 * PRICE and t["refunded"] == 1 and t["net_paid_cents"] == PRICE
    assert t["members_taking"] == 1
    asha = next(m for m in rep["members"] if m["user_id"] == A)
    assert asha["taken"] == 5 and asha["active_days"] == 1
    assert {m["user_id"] for m in rep["members"]} == {LEADER, A}
    assert rep["days"][0]["paid"] == 2 and rep["days"][0]["free"] == 3

    detail = (await client.get(f"/api/v1/team/my-team/{A}/claims", params={"period": "all"})).json()
    assert len(detail["claims"]) == 5
    gift = next(c for c in detail["claims"] if c["source"] == "admin_gift")
    assert gift["given_by"] == "Admin" and gift["source_label"] == "Given free by admin"
    assert sum(1 for c in detail["claims"] if c["refunded"]) == 1
    assert all(c["status_label"] for c in detail["claims"])


async def test_report_is_own_team_only(ctx):
    client, _Session, who = ctx
    _as(who, LEADER, "leader")
    assert (await client.get(f"/api/v1/team/my-team/{OUT}/claims")).status_code == 404
    assert (await client.get("/api/v1/team/my-team/claims", params={"period": "bogus"})).status_code == 422
    _as(who, A, "team")
    assert (await client.get("/api/v1/team/my-team/claims")).status_code == 403
