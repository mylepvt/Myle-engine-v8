"""GST-ready invoices (per-type financial-year series, frozen buyer/seller, IST dates, CGST/SGST
option) and admin refunds with credit notes."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import now_ist
from app.db.base import Base
from app.models.app_setting import AppSetting
from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services.invoice_alloc import allocate_invoice_number, financial_year_token
from app.services.invoice_html import GST_MODE_KEY, issued_on_ist, render_invoice_html
from app.services.invoice_records import create_payment_receipt_for_recharge
from app.services.wallet_guard import wallet_balance_cents

A, ADMIN = 7701, 7700
PRICE = 1666
FY = financial_year_token(now_ist().date())


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F07700", email="a@t.myle", role="admin", name="Admin"),
            User(id=A, fbo_id="F07701", email="m@t.myle", role="team", name="Asha Rao",
                 username="asha", phone="9800000001"),
        ])
        s.add(WalletLedgerEntry(user_id=A, amount_cents=10_000, currency="INR",
                                idempotency_key="topup", note="topup"))
        for i in range(3):
            s.add(Lead(name=f"Pool {i}", status="new_lead", created_by_user_id=ADMIN, in_pool=True,
                       pool_type="paid", pool_price_cents=PRICE, outcome="active"))
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


async def _claim(client, n=3) -> Invoice:
    r = await client.post("/api/v1/lead-pool/claim", json={"count": n})
    assert r.status_code == 200, r.text


async def _the_invoice(Session) -> Invoice:
    async with Session() as s:
        return (await s.execute(select(Invoice).where(Invoice.doc_type == "tax_invoice"))).scalar_one()


def test_financial_year_token():
    from datetime import date

    assert financial_year_token(date(2026, 10, 11)) == "2627"
    assert financial_year_token(date(2027, 3, 31)) == "2627"
    assert financial_year_token(date(2027, 4, 1)) == "2728"


async def test_each_document_type_has_its_own_gap_free_series(ctx):
    _client, Session, _who = ctx
    async with Session() as s:
        nums = [
            await allocate_invoice_number(s, "tax_invoice"),
            await allocate_invoice_number(s, "payment_receipt"),
            await allocate_invoice_number(s, "tax_invoice"),
            await allocate_invoice_number(s, "credit_note"),
        ]
    assert nums == [f"MYL-{FY}-0001", f"RCP-{FY}-0001", f"MYL-{FY}-0002", f"CN-{FY}-0001"]


async def test_invoice_freezes_who_bought_and_dates_in_ist(ctx):
    client, Session, _who = ctx
    await _claim(client)
    inv = await _the_invoice(Session)
    assert inv.invoice_number == f"MYL-{FY}-0001"
    assert inv.payload_json["buyer"]["name"] == "Asha Rao"
    assert inv.payload_json["seller"]["gstin"] == "08HKSPS3607C1ZS"
    assert inv.payload_json["amount_in_words"].endswith("Paise Only")  # ₹49.98
    async with Session() as s:  # the member is renamed later
        member = await s.get(User, A)
        member.name = "Someone Else"
        await s.commit()
        html = render_invoice_html(invoice=inv, member=member)
    assert "Asha Rao" in html and "Someone Else" not in html
    assert "IGST @18%" in html


def test_dates_print_in_ist():
    # 1 Jan 00:30 IST is still 31 Dec in UTC — the invoice must say 1 Jan.
    assert issued_on_ist(datetime(2026, 12, 31, 19, 0, tzinfo=timezone.utc)) == "01-Jan-2027"


async def test_by_state_mode_splits_cgst_and_sgst(ctx):
    client, Session, _who = ctx
    async with Session() as s:
        s.add(AppSetting(key=GST_MODE_KEY, value="by_state"))
        await s.commit()
    await _claim(client)
    inv = await _the_invoice(Session)
    p = inv.payload_json
    assert "igst_rupees" not in p
    assert round(p["subtotal_rupees"] + p["cgst_rupees"] + p["sgst_rupees"], 2) == p["total_rupees"]
    assert p["place_of_supply"] == "Rajasthan (08)"
    async with Session() as s:
        html = render_invoice_html(invoice=inv, member=await s.get(User, A))
    assert "CGST @9%" in html and "SGST @9%" in html


async def test_receipts_use_their_own_series(ctx):
    _client, Session, _who = ctx
    async with Session() as s:
        entry = WalletLedgerEntry(user_id=A, amount_cents=500, currency="INR", idempotency_key="r1", note="r")
        s.add(entry)
        await s.flush()
        rcp = await create_payment_receipt_for_recharge(
            s, recharge_id=1, user_id=A, amount_cents=500, utr_number="UTR1", wallet_ledger_entry_id=entry.id)
    assert rcp.invoice_number == f"RCP-{FY}-0001"
    assert rcp.payload_json["buyer"]["name"] == "Asha Rao"


async def test_admin_refund_issues_a_credit_note_and_returns_the_money(ctx):
    client, Session, who = ctx
    await _claim(client)
    inv = await _the_invoice(Session)
    lead_ids = [int(line["lead_ref"].split("#")[1]) for line in inv.payload_json["lines"]]

    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund",
                          json={"lead_ids": lead_ids[:1], "reason": "Wrong number"})
    assert r.status_code == 403  # members can't refund themselves

    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund",
                          json={"lead_ids": lead_ids[:2], "reason": "Wrong number"})
    assert r.status_code == 200, r.text
    assert r.json() == {"credit_note_number": f"CN-{FY}-0001", "amount_cents": 2 * PRICE}

    async with Session() as s:
        assert await wallet_balance_cents(s, A) == 10_000 - 3 * PRICE + 2 * PRICE
        cn = (await s.execute(select(Invoice).where(Invoice.doc_type == "credit_note"))).scalar_one()
        assert cn.payload_json["against_invoice"] == inv.invoice_number
        assert [line["lead_ref"] for line in cn.payload_json["lines"]] == [f"Lead #{i}" for i in lead_ids[:2]]
        # The refunded lead leaves the member's board; a fresh, unowned copy goes back to the pool.
        old = await s.get(Lead, lead_ids[0])
        assert old.in_pool is False and old.archived_at is not None and old.owner_user_id == A
        assert (await s.get(Lead, lead_ids[2])).archived_at is None
        copies = (await s.execute(select(Lead).where(Lead.in_pool.is_(True)))).scalars().all()
        assert sorted(c.name for c in copies) == sorted([old.name, (await s.get(Lead, lead_ids[1])).name])
        assert all(c.owner_user_id is None and c.status == "new_lead" for c in copies)
        html = render_invoice_html(invoice=cn, member=await s.get(User, A))
    assert "CREDIT NOTE" in html and inv.invoice_number in html and "Wrong number" in html

    # A lead is refunded once — the second try is refused, not paid again.
    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund",
                          json={"lead_ids": lead_ids[:1], "reason": "again"})
    assert r.status_code == 409
    body = (await client.get(f"/api/v1/invoices/{inv.invoice_number}/refundable")).json()
    assert [line["refunded"] for line in body["lines"]] == [True, True, False]
    # Leads not on the invoice are refused.
    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund",
                          json={"lead_ids": [999999], "reason": "nope"})
    assert r.status_code == 400

    # Someone else can buy the returned leads (the old owner stays on the original row).
    who["user"] = AuthUser(user_id=A, role="team", email="m@t.myle")
    r = await client.post("/api/v1/lead-pool/claim", json={"count": 2})
    assert r.status_code == 200, r.text
    assert len(r.json()["leads"]) == 2


async def test_refund_only_pays_back_the_debit_of_that_invoice(ctx):
    """Old single-claim invoices all said "Lead #1": a refund must never pull in a payment that
    belongs to a different invoice."""
    client, Session, who = ctx
    await _claim(client, n=1)
    inv = await _the_invoice(Session)
    lead_id = int(inv.payload_json["lines"][0]["lead_ref"].split("#")[1])
    async with Session() as s:
        stale = Invoice(
            invoice_number=f"MYL-{FY}-0099", doc_type="tax_invoice", user_id=A, total_cents=PRICE,
            issued_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
            payload_json={"lines": [{"lead_ref": f"Lead #{lead_id}", "amount_cents": PRICE}]},
        )
        s.add(stale)
        await s.commit()

    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    r = await client.post(f"/api/v1/invoices/{stale.invoice_number}/refund",
                          json={"lead_ids": [lead_id], "reason": "Wrong number", "return_to_pool": False})
    assert r.status_code == 400, r.text
    r = await client.post(f"/api/v1/invoices/{inv.invoice_number}/refund",
                          json={"lead_ids": [lead_id], "reason": "Wrong number", "return_to_pool": False})
    assert r.status_code == 200, r.text


async def test_owner_can_download_new_numbers_others_cannot(ctx):
    client, Session, who = ctx
    await _claim(client)
    inv = await _the_invoice(Session)
    r = await client.get(f"/invoice/{inv.invoice_number}/download")
    assert r.status_code == 200 and inv.invoice_number in r.text
    async with Session() as s:
        s.add(User(id=7702, fbo_id="F07702", email="o@t.myle", role="team", name="Other"))
        await s.commit()
    who["user"] = AuthUser(user_id=7702, role="team", email="o@t.myle")
    assert (await client.get(f"/invoice/{inv.invoice_number}/download")).status_code == 403
