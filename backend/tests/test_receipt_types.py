"""Payment receipts say what they are for, carry the admin's note, and are stamped."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.invoice import Invoice
from app.models.user import User
from app.services.invoice_html import render_invoice_html

ADMIN, LEADER, A = 7800, 7801, 7802


@pytest.fixture
async def ctx(monkeypatch):
    from main import app

    async def _no_push(*_a, **_k):
        return None

    import app.api.v1.wallet as wallet_api

    monkeypatch.setattr(wallet_api, "send_push_to_user_bg", _no_push)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F7800", email="a@t.myle", role="admin", name="Admin"),
            User(id=LEADER, fbo_id="F7801", email="l@t.myle", role="leader", name="Pushpinder"),
            User(id=A, fbo_id="F7802", email="m@t.myle", role="team", name="Divya", upline_user_id=LEADER),
        ])
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    who = {"user": AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session, who
    app.dependency_overrides = saved
    await engine.dispose()


async def _receipt(Session, amount: int) -> tuple[Invoice, User]:
    async with Session() as s:
        inv = (await s.execute(select(Invoice).where(Invoice.total_cents == amount))).scalar_one()
        return inv, await s.get(User, inv.user_id)


async def test_admin_credit_and_free_credit_receipts(ctx):
    client, Session, _who = ctx
    for amount, kind, note in ((1667, "adjustment", "Cash taken at the office"), (2500, "promo", "Diwali gift")):
        r = await client.post(
            "/api/v1/wallet/adjustments",
            json={"user_id": A, "amount_cents": amount, "idempotency_key": f"rcpt-{amount}-key", "kind": kind, "note": note},
        )
        assert r.status_code == 201, r.text

    inv, member = await _receipt(Session, 1667)
    assert inv.payload_json["receipt_type"] == "admin_credit"
    assert inv.payload_json["receipt_description"] == "Cash taken at the office"
    page = render_invoice_html(invoice=inv, member=member)
    assert "Cash taken at the office" in page and "ADMIN CREDIT" in page
    assert "Administrative wallet credit" not in page

    inv, member = await _receipt(Session, 2500)
    assert inv.payload_json["receipt_type"] == "free_credit"
    assert inv.payload_json["receipt_description"] == "Diwali gift"  # without the "Promo:" tag
    page = render_invoice_html(invoice=inv, member=member)
    assert "FREE CREDIT · NOT PAID" in page and ">FREE<" in page and ">PAID<" not in page


async def test_free_recharge_approval_issues_a_free_receipt(ctx):
    client, Session, who = ctx
    who["user"] = AuthUser(user_id=LEADER, role="leader", email="l@t.myle")
    req = (await client.post("/api/v1/wallet/free-recharge-requests",
                             json={"user_id": A, "amount_cents": 80000, "reason": "New joiner"})).json()
    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    assert (await client.patch(f"/api/v1/wallet/free-recharge-requests/{req['id']}", json={"status": "approved"})).status_code == 200

    inv, member = await _receipt(Session, 80000)
    assert inv.payload_json["receipt_type"] == "free_credit"
    assert inv.payload_json["receipt_description"] == "New joiner"
    assert inv.payload_json["payment_reference"] == f"Free recharge #{req['id']} · asked by Pushpinder"
    assert "FREE CREDIT" in render_invoice_html(invoice=inv, member=member)


async def test_paid_recharge_receipt_is_stamped_paid(ctx):
    client, Session, who = ctx
    who["user"] = AuthUser(user_id=A, role="team", email="m@t.myle")
    req = (await client.post("/api/v1/wallet/recharge-requests", json={"amount_cents": 50000, "utr_number": "UTR-RCPT-1"})).json()
    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    assert (await client.patch(f"/api/v1/wallet/recharge-requests/{req['id']}", json={"status": "approved"})).status_code == 200
    inv, member = await _receipt(Session, 50000)
    assert inv.payload_json["receipt_type"] == "paid_recharge"
    page = render_invoice_html(invoice=inv, member=member)
    assert "PAID RECHARGE" in page and ">PAID<" in page
