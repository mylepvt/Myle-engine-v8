"""Refundable security deposit: lead consent → receipt → Day 1, refunds, the gate, Ledger outbox.

Runs with the deposit gate ON (the production default; see conftest ``_deposit_gate``).
Hierarchy: leader 202 → team 201; admin 203.
"""
from __future__ import annotations

import base64
import io
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pdfplumber
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.config import settings
from app.models.deposit import DepositConsent, DepositLedgerOutbox, DepositReceipt
from app.models.ledger_bridge_outbox import LedgerBridgeOutbox
from app.models.user import User
from app.services import deposits

pytestmark = pytest.mark.deposit_gate

_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
_RECEIPT_RE = re.compile(r"^MYLE-DEP-\d{4}-\d{4,}$")


@asynccontextmanager
async def _as(engine, role: str | None, user_id: int = 0):
    from main import app

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)

    async def _get_db():
        async with factory() as session:
            yield session

    async def _fake_auth():
        return AuthUser(user_id=user_id, role=role or "team", email=f"u{user_id}@test.myle", fbo_id=f"T{user_id:05d}")

    app.dependency_overrides[get_db] = _get_db
    if role:
        app.dependency_overrides[require_auth_user] = _fake_auth
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


async def _seed(engine) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        for uid, role, up in ((202, "leader", None), (201, "team", 202), (203, "admin", None)):
            u = await s.get(User, uid)
            if u is None:
                s.add(
                    User(
                        id=uid,
                        name=f"Test {role} {uid}",
                        username=f"test_{role}_{uid}",
                        email=f"test_{role}_{uid}@myle.test",
                        role=role,
                        registration_status="approved",
                        fbo_id=f"F{uid:05d}",
                        upline_user_id=up,
                    )
                )
            else:
                u.upline_user_id = up
        await s.commit()


async def _lead_at_video_watched(team: AsyncClient, phone: str, name: str = "Rohit Kumar") -> int:
    r = await team.post("/api/v1/leads", json={"name": name, "status": "new_lead", "phone": phone, "city": "Jaipur"})
    assert r.status_code == 201, r.text
    lead_id = r.json()["id"]
    for st in ("contacted", "invited", "video_sent", "video_watched"):
        assert (await team.patch(f"/api/v1/leads/{lead_id}", json={"status": st})).status_code == 200
    return lead_id


async def _consent(client: AsyncClient, lead_id: int, phone: str, amount: int = 196) -> str:
    r = await client.post(f"/api/v1/deposits/leads/{lead_id}/consent-link", json={"amount_rupees": amount})
    assert r.status_code == 200, r.text
    token = r.json()["consent"]["token"]
    terms = (await client.post(f"/api/deposit/consent/{token}/verify", json={"phone": phone})).json()
    r = await client.post(
        f"/api/deposit/consent/{token}/accept",
        json={"phone": phone, "typed_name": "Rohit Kumar", "agreed": True, "terms_sha256": terms["terms_sha256"]},
    )
    assert r.status_code == 200, r.text
    return token


def _now_iso(minutes_ago: int = 5) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


async def _upload(client: AsyncClient, lead_id: int, *, amount: int = 196, mode: str | None = "upi", ref: str | None = "412345678901", paid_at: str | None = None):
    data = {"amount_rupees": str(amount)}
    if mode is not None:
        data["payment_mode"] = mode
    if ref is not None:
        data["payment_ref"] = ref
    data["paid_at"] = paid_at or _now_iso()
    return await client.post(
        f"/api/v1/leads/{lead_id}/send-to-day1", data=data, files={"screenshot": ("pay.png", _PNG, "image/png")}
    )


def _pdf_text(data: bytes) -> str:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


# ── the happy path, and every check on the way ───────────────────────────────


async def test_consent_then_payment_then_receipt_then_day1(engine):
    await _seed(engine)
    phone = "9811100001"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)

        # No consent → can't enroll.
        r = await _upload(team, lead_id)
        assert r.status_code == 400 and "consent" in r.text

        r = await team.post(f"/api/v1/deposits/leads/{lead_id}/consent-link", json={"amount_rupees": 196})
        assert r.status_code == 200, r.text
        state = r.json()
        assert state["gate_enabled"] is True and state["consent"]["state"] == "pending"
        token = state["consent"]["token"]

        # The lead's side: masked number, then their own number unlocks the terms.
        info = (await team.get(f"/api/deposit/consent/{token}")).json()
        assert info == {
            "business_name": "Myle Community",
            "support_email": "support@mylecommunity.in",
            "amount_rupees": 196,
            "masked_phone": "XXXXXX0001",
            "state": "pending",
        }
        assert (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": "9999999999"})).status_code == 403
        terms = (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": f"+91 {phone}"})).json()
        assert terms["terms_text"].startswith("MYLE COMMUNITY\nSecurity Deposit & Consent Declaration")
        assert "₹196 (Rupees One Hundred Ninety-Six Only)" in terms["terms_text"]
        assert "100% refundable" in terms["terms_text"] and "नमस्ते" not in terms["terms_text"]
        assert terms["terms_version"] == "v2"

        accept = {"phone": phone, "typed_name": "Rohit Kumar", "agreed": True, "terms_sha256": terms["terms_sha256"]}
        assert (await team.post(f"/api/deposit/consent/{token}/accept", json={**accept, "agreed": False})).status_code == 400
        assert (await team.post(f"/api/deposit/consent/{token}/accept", json={**accept, "terms_sha256": "x"})).status_code == 409
        r = await team.post(f"/api/deposit/consent/{token}/accept", json=accept, headers={"user-agent": "LeadPhone/1.0"})
        assert r.status_code == 200 and r.json()["state"] == "given"

        # Payment details must be right.
        assert (await _upload(team, lead_id, mode=None)).status_code == 400
        assert (await _upload(team, lead_id, ref=None)).status_code == 400
        assert (await _upload(team, lead_id, ref="41234567890")).status_code == 400  # UPI = 12 digits
        assert (await _upload(team, lead_id, amount=199)).status_code == 400  # agreed to ₹196
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        assert (await _upload(team, lead_id, paid_at=future)).status_code == 400

        r = await _upload(team, lead_id, ref="4123 4567 8901")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "day1"

    async with _as(engine, "leader", 202) as leader:
        state = (await leader.get(f"/api/v1/deposits/leads/{lead_id}")).json()
        receipt = state["receipt"]
        assert _RECEIPT_RE.match(receipt["receipt_number"])
        assert receipt["status"] == "held" and receipt["amount_rupees"] == 196
        assert receipt["payment_ref"] == "412345678901" and receipt["lead_city"] == "Jaipur"
        assert receipt["consent_state"] == "given"

        pdf = await leader.get(receipt["pdf_path"])
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        text = _pdf_text(pdf.content)
        for needle in (
            "Refundable Security Deposit Receipt",
            receipt["receipt_number"],
            "Rohit Kumar",
            phone,
            "Jaipur",
            "One Hundred Ninety Six Rupees Only",
            "412345678901",
            "Not a product purchase or service fee",
            "This deposit is 100% refundable.",
            "Computer-generated receipt, no signature required.",
            "Myle Community",
            "Email: support@mylecommunity.in",
        ):
            assert needle in text, needle
        assert "Address" not in text and "[FILL IN]" not in text
        assert "GST" not in text.upper()

    # Consent evidence is sealed and verifiable.
    async with AsyncSession(engine) as s:
        c = (await s.execute(select(DepositConsent).where(DepositConsent.lead_id == lead_id))).scalars().one()
        consent_id = c.id
        assert c.user_agent == "LeadPhone/1.0" and c.typed_name == "Rohit Kumar" and c.verified_phone == phone
    async with _as(engine, "admin", 203) as admin:
        ev = (await admin.get(f"/api/v1/deposits/consents/{consent_id}/evidence")).json()
        assert ev["evidence_seal_matches"] is True and ev["terms_hash_matches"] is True
    async with _as(engine, "team", 201) as team:
        assert (await team.get(f"/api/v1/deposits/consents/{consent_id}/evidence")).status_code == 403


async def test_gate_blocks_status_moves_without_receipt(engine):
    await _seed(engine)
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, "9811100002")
    async with _as(engine, "admin", 203) as admin:
        for target in ("day1", "day2", "converted"):
            r = await admin.patch(f"/api/v1/leads/{lead_id}", json={"status": target})
            assert r.status_code == 400 and "deposit" in r.text.lower(), r.text
        r = await admin.post(f"/api/v1/leads/{lead_id}/transition", json={"target_status": "day1"})
        assert r.status_code == 400 and "deposit" in r.text.lower(), r.text
        # Moving sideways (lost / retarget) is never blocked.
        assert (await admin.patch(f"/api/v1/leads/{lead_id}", json={"status": "lost"})).status_code == 200

        # Admin can switch the gate off (e.g. an emergency); then moves go through.
        r = await admin.put("/api/v1/deposits/settings", json={"gate_enabled": False})
        assert r.status_code == 200 and r.json()["gate_enabled"] is False
        try:
            async with _as(engine, "team", 201) as team:
                other = await _lead_at_video_watched(team, "9811100003")
                r = await _upload(team, other, mode=None, ref=None)
                assert r.status_code == 200 and r.json()["status"] == "day1"
                assert (await team.get(f"/api/v1/deposits/leads/{other}")).json()["receipt"] is None
        finally:
            async with _as(engine, "admin", 203) as admin2:
                await admin2.put("/api/v1/deposits/settings", json={"gate_enabled": True})


async def test_withdrawn_consent_blocks_and_staff_cannot_agree(engine):
    await _seed(engine)
    phone = "9811100004"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        r = await team.post(f"/api/v1/deposits/leads/{lead_id}/consent-link", json={"amount_rupees": 150})
        token = r.json()["consent"]["token"]
        terms = (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": phone})).json()
        body = {"phone": phone, "typed_name": "Rohit", "agreed": True, "terms_sha256": terms["terms_sha256"]}

        # A browser signed in to Myle is staff — it can't agree for the lead.
        r = await team.post(f"/api/deposit/consent/{token}/accept", json=body, cookies={"myle_access": "x"})
        assert r.status_code == 403

        assert (await team.post(f"/api/deposit/consent/{token}/accept", json=body)).status_code == 200
        r = await team.post(f"/api/deposit/consent/{token}/withdraw", json={"phone": phone})
        assert r.status_code == 200 and r.json()["state"] == "withdrawn"
        r = await _upload(team, lead_id, amount=150, ref="512345678901")
        assert r.status_code == 400 and "consent" in r.text


async def test_email_after_agreeing_sends_one_welcome_email(engine, monkeypatch):
    from app.services import mailer

    sent: list[dict] = []

    async def _fake_send(**kw):
        sent.append(kw)

    monkeypatch.setattr(mailer, "mail_configured", lambda: True)
    monkeypatch.setattr(mailer, "send_email", _fake_send)
    await _seed(engine)
    phone = "9811100021"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        r = await team.post(f"/api/v1/deposits/leads/{lead_id}/consent-link", json={"amount_rupees": 149})
        token = r.json()["consent"]["token"]
        url = f"/api/deposit/consent/{token}/email"

        # Not before agreeing; and the registered mobile is checked.
        assert (await team.post(url, json={"phone": phone, "email": "rohit@example.com"})).status_code == 400
        terms = (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": phone})).json()
        body = {"phone": phone, "typed_name": "Rohit Kumar", "agreed": True, "terms_sha256": terms["terms_sha256"]}
        assert (await team.post(f"/api/deposit/consent/{token}/accept", json=body)).status_code == 200
        assert (await team.post(url, json={"phone": "9999999999", "email": "rohit@example.com"})).status_code == 403
        assert (await team.post(url, json={"phone": phone, "email": "not-an-email"})).status_code == 422
        assert (await team.post(url, json={"phone": phone, "email": "r@x.com"}, cookies={"myle_access": "x"})).status_code == 403

        r = await team.post(url, json={"phone": phone, "email": " Rohit@Example.com "})
        assert r.status_code == 200, r.text
        assert r.json()["email_result"] == "sent" and r.json()["email"] == "rohit@example.com"
        assert r.json()["welcome_email_sent_at"]
        assert sent[0]["to"] == "rohit@example.com" and sent[0]["subject"] == "Welcome to Myle Community, Rohit!"
        assert "₹149" in sent[0]["html"] and "100% refundable" in sent[0]["text"]

        # Same address again: no second email. A corrected address gets one.
        assert (await team.post(url, json={"phone": phone, "email": "rohit@example.com"})).json()["email_result"] == "already_sent"
        assert (await team.post(url, json={"phone": phone, "email": "rohit.k@example.com"})).json()["email_result"] == "sent"
        assert len(sent) == 2
        lead = (await team.get(f"/api/v1/leads/{lead_id}")).json()
        assert lead["email"] == "rohit@example.com"  # the lead keeps the first address given


async def test_email_is_saved_when_mail_is_not_configured(engine, monkeypatch):
    from app.services import mailer

    monkeypatch.setattr(mailer, "mail_configured", lambda: False)
    await _seed(engine)
    phone = "9811100022"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        token = await _consent(team, lead_id, phone, amount=149)
        r = await team.post(f"/api/deposit/consent/{token}/email", json={"phone": phone, "email": "a@example.com"})
        assert r.status_code == 200 and r.json()["email_result"] == "saved" and r.json()["welcome_email_sent_at"] is None


async def test_wrong_numbers_lock_the_link(engine):
    await _seed(engine)
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, "9811100005")
        token = (await team.post(f"/api/v1/deposits/leads/{lead_id}/consent-link", json={"amount_rupees": 196})).json()[
            "consent"
        ]["token"]
        for _ in range(deposits.MAX_PHONE_ATTEMPTS):
            assert (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": "9000000000"})).status_code == 403
        r = await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": "9811100005"})
        assert r.status_code == 429


async def test_send_back_cancels_receipt_and_numbers_are_never_reused(engine):
    await _seed(engine)
    phone = "9811100006"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        await _consent(team, lead_id, phone)
        assert (await _upload(team, lead_id, ref="612345678901")).status_code == 200
        first = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]["receipt_number"]

        # The same Transaction ID can't back a second lead's receipt.
        other = await _lead_at_video_watched(team, "9811100007")
        await _consent(team, other, "9811100007")
        r = await _upload(team, other, ref="612345678901")
        assert r.status_code == 409 and first in r.text

    async with _as(engine, "leader", 202) as leader:
        assert (await leader.post(f"/api/v1/leads/{lead_id}/send-back", json={"reason": "blurry"})).status_code == 200

    async with AsyncSession(engine) as s:
        old = (await s.execute(select(DepositReceipt).where(DepositReceipt.receipt_number == first))).scalar_one()
        assert old.status == "cancelled" and "blurry" in old.cancel_reason

    async with _as(engine, "team", 201) as team:
        # Re-upload (consent still given) gets a NEW number; the cancelled one stays used.
        r = await _upload(team, lead_id, ref="612345678901")
        assert r.status_code == 200, r.text
        second = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]["receipt_number"]
        assert second != first and int(second.rsplit("-", 1)[1]) > int(first.rsplit("-", 1)[1])


async def test_refund_list_search_and_public_receipt(engine):
    await _seed(engine)
    phone = "9811100008"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone, name="Sunita Devi")
        await _consent(team, lead_id, phone, amount=200)
        assert (await _upload(team, lead_id, amount=200, mode="bank_transfer", ref="UTR-HDFC-778899")).status_code == 200
        receipt = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]
        assert (await team.get("/api/v1/deposits/receipts")).status_code == 403
        assert (await team.post(f"/api/v1/deposits/receipts/{receipt['receipt_number']}/refund", json={})).status_code in (403, 422)

    async with _as(engine, "admin", 203) as admin:
        for q in ("Sunita", phone, receipt["receipt_number"], "778899"):
            r = (await admin.get("/api/v1/deposits/receipts", params={"q": q})).json()
            assert any(i["receipt_number"] == receipt["receipt_number"] for i in r["items"]), q
        num = receipt["receipt_number"]
        bad = await admin.post(f"/api/v1/deposits/receipts/{num}/refund", json={"refunded_at": _now_iso(0), "refund_ref": "x"})
        assert bad.status_code == 400
        r = await admin.post(
            f"/api/v1/deposits/receipts/{num}/refund",
            json={"refunded_at": _now_iso(0), "refund_ref": "rfnd 9988 7766", "note": "Did not continue"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "refunded" and r.json()["refund_ref"] == "RFND99887766"
        again = await admin.post(f"/api/v1/deposits/receipts/{num}/refund", json={"refunded_at": _now_iso(0), "refund_ref": "RFND1234567"})
        assert again.status_code == 400
        held = (await admin.get("/api/v1/deposits/receipts", params={"status": "refunded", "q": num})).json()
        assert held["total"] == 1

        text = _pdf_text((await admin.get(r.json()["pdf_path"])).content)
        assert "REFUNDED" in text and "RFND99887766" in text

    # The lead's own link: their number opens the PDF, any other doesn't.
    async with _as(engine, None) as anon:
        info = (await anon.get(f"/api/deposit/receipt/{receipt['share_token']}")).json()
        assert info["receipt_number"] == num and info["masked_phone"] == "XXXXXX0008"
        assert (await anon.post(f"/api/deposit/receipt/{receipt['share_token']}/pdf", json={"phone": "9000000000"})).status_code == 403
        r = await anon.post(f"/api/deposit/receipt/{receipt['share_token']}/pdf", json={"phone": phone})
        assert r.status_code == 200 and r.content.startswith(b"%PDF")


async def test_manual_generate_receipt_for_an_enrollment_without_one(engine):
    await _seed(engine)
    phone = "9811100009"
    async with _as(engine, "admin", 203) as admin:
        await admin.put("/api/v1/deposits/settings", json={"gate_enabled": False})
    try:
        async with _as(engine, "team", 201) as team:
            lead_id = await _lead_at_video_watched(team, phone)
            assert (await _upload(team, lead_id, mode=None, ref=None)).status_code == 200  # enrolled before consent
    finally:
        async with _as(engine, "admin", 203) as admin:
            await admin.put("/api/v1/deposits/settings", json={"gate_enabled": True})

    async with _as(engine, "leader", 202) as leader:
        body = {"payment_mode": "upi", "payment_ref": "912345678901", "paid_at": _now_iso()}
        r = await leader.post(f"/api/v1/deposits/leads/{lead_id}/receipt", json=body)
        assert r.status_code == 400 and "consent" in r.text  # still needs the lead's consent
        await _consent(leader, lead_id, phone)
        r = await leader.post(f"/api/v1/deposits/leads/{lead_id}/receipt", json=body)
        assert r.status_code == 200, r.text
        assert _RECEIPT_RE.match(r.json()["receipt"]["receipt_number"])
        assert (await leader.post(f"/api/v1/deposits/leads/{lead_id}/receipt", json=body)).status_code == 409


async def test_settings_go_on_new_receipts(engine):
    await _seed(engine)
    async with _as(engine, "admin", 203) as admin:
        r = await admin.put("/api/v1/deposits/settings", json={"support_email": "help@myle.test"})
        assert r.json()["business_name"] == "Myle Community" and r.json()["support_email"] == "help@myle.test"
        assert (await admin.put("/api/v1/deposits/settings", json={"support_email": "not an email"})).status_code == 422
    phone = "9811100010"
    try:
        async with _as(engine, "team", 201) as team:
            lead_id = await _lead_at_video_watched(team, phone)
            await _consent(team, lead_id, phone)
            assert (await _upload(team, lead_id, ref="102345678901")).status_code == 200
            receipt = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]
            text = _pdf_text((await team.get(receipt["pdf_path"])).content)
            assert "Email: help@myle.test" in text and "support@mylecommunity.in" not in text
    finally:
        async with _as(engine, "admin", 203) as admin:
            # Blank goes back to the default support email.
            r = await admin.put("/api/v1/deposits/settings", json={"support_email": ""})
            assert r.json()["support_email"] == "support@mylecommunity.in"


async def test_ledger_gets_deposits_on_their_own_queue(engine, monkeypatch):
    await _seed(engine)
    monkeypatch.setattr(settings, "myle_bridge_secret", "s" * 40)
    phone = "9811100011"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        await _consent(team, lead_id, phone)
        assert (await _upload(team, lead_id, ref="112345678901")).status_code == 200

    async with AsyncSession(engine) as s:
        rows = (await s.execute(select(DepositLedgerOutbox).order_by(DepositLedgerOutbox.id))).scalars().all()
        kinds = [r.payload["type"] for r in rows if (r.payload.get("receipt") or r.payload.get("consent") or {}).get("lead_id") == lead_id]
        assert kinds == ["deposit.consent_given", "deposit.receipt_issued"]
        issued = next(r.payload for r in rows if r.payload["type"] == "deposit.receipt_issued" and r.payload["receipt"]["lead_id"] == lead_id)
        assert issued["receipt"]["payment_ref"] == "112345678901" and issued["consent"]["evidence_sha256"]
        lead_events = (await s.execute(select(LedgerBridgeOutbox))).scalars().all()
        assert not any(str(e.payload.get("type", "")).startswith("deposit.") for e in lead_events)

    import httpx

    from app.services import deposit_ledger

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["sig"] = request.headers.get("x-myle-signature")
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(settings, "ledger_bridge_url", "https://ledger.test")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await deposit_ledger.post_events([issued], client=client)
    assert seen["url"] == "https://ledger.test/api/bridge/deposits" and seen["sig"]


def test_amount_in_words():
    assert deposits.rupees_in_words(196) == "One Hundred Ninety Six Rupees Only"
    assert deposits.rupees_in_words(149) == "One Hundred Forty Nine Rupees Only"
    assert deposits.rupees_in_words(200) == "Two Hundred Rupees Only"
    assert deposits.rupees_in_words(110) == "One Hundred Ten Rupees Only"
    assert deposits.rupees_in_words_formal(149) == "Rupees One Hundred Forty-Nine Only"
    assert deposits.rupees_in_words_formal(160) == "Rupees One Hundred Sixty Only"


def test_payment_ref_rules():
    assert deposits.normalize_payment_ref("upi", " 4123 4567 8901 ") == "412345678901"
    assert deposits.normalize_payment_ref("bank_transfer", "hdfc-utr-123456") == "HDFC-UTR-123456"
    for mode, ref in (("upi", "ABC123456789"), ("upi", ""), ("card", "12"), ("cash", "123456")):
        with pytest.raises(deposits.DepositError):
            deposits.normalize_payment_ref(mode, ref)
