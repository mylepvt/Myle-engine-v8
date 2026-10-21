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


async def _link_token(client: AsyncClient, lead_id: int) -> str:
    consent = (await client.get(f"/api/v1/deposits/leads/{lead_id}")).json()["consent"]
    assert consent and consent["token"], consent
    return consent["token"]


async def _agree(client: AsyncClient, token: str, phone: str, name: str = "Rohit Kumar") -> None:
    terms = (await client.post(f"/api/deposit/consent/{token}/verify", json={"phone": phone})).json()
    r = await client.post(
        f"/api/deposit/consent/{token}/accept",
        json={"phone": phone, "typed_name": name, "agreed": True, "terms_sha256": terms["terms_sha256"]},
    )
    assert r.status_code == 200, r.text


async def _register(client: AsyncClient, token: str, phone: str, *, image: bytes = _PNG, name: str = "Rohit Kumar", email: str = "rohit@example.com", active_phone: str | None = None):
    data = {"phone": phone, "name": name, "email": email, "active_phone": active_phone or phone}
    return await client.post(
        f"/api/deposit/consent/{token}/register", data=data, files={"screenshot": ("pay.png", image, "image/png")}
    )


async def _enroll(client: AsyncClient, lead_id: int, phone: str, *, amount: int = 196, mode: str = "upi", ref: str = "412345678901", name: str = "Rohit Kumar") -> dict:
    """The whole flow: member uploads → prospect agrees → registers with the same screenshot."""
    r = await _upload(client, lead_id, amount=amount, mode=mode, ref=ref)
    assert r.status_code == 200, r.text
    token = await _link_token(client, lead_id)
    await _agree(client, token, phone, name)
    r = await _register(client, token, phone, name=name)
    assert r.status_code == 200, r.text
    assert r.json()["registration_stage"] == "done", r.json()
    return r.json()


def _other_png() -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (300, 600), "white")
    d = ImageDraw.Draw(img)
    for i in range(0, 600, 40):
        d.rectangle((0, i, 300, i + 20), fill=(i % 255, 40, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


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


async def test_payment_then_link_then_agree_register_and_day1(engine):
    await _seed(engine)
    phone = "9811100001"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)

        # Payment details must be right.
        assert (await _upload(team, lead_id, mode=None)).status_code == 400
        assert (await _upload(team, lead_id, ref=None)).status_code == 400
        assert (await _upload(team, lead_id, ref="41234567890")).status_code == 400  # UPI = 12 digits
        assert (await _upload(team, lead_id, amount=250)).status_code == 400
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        assert (await _upload(team, lead_id, paid_at=future)).status_code == 400

        # The upload doesn't move the lead: it waits for the prospect.
        r = await _upload(team, lead_id, ref="4123 4567 8901")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "video_watched"
        state = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()
        assert state["receipt"] is None
        assert state["consent"]["state"] == "pending" and state["consent"]["registration_stage"] == "register"
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
        assert terms["terms_version"] == "v2" and terms["registration_stage"] == "register"

        # Registering needs the agreement first.
        assert (await _register(team, token, phone)).status_code == 400

        accept = {"phone": phone, "typed_name": "Rohit Kumar", "agreed": True, "terms_sha256": terms["terms_sha256"]}
        assert (await team.post(f"/api/deposit/consent/{token}/accept", json={**accept, "agreed": False})).status_code == 400
        assert (await team.post(f"/api/deposit/consent/{token}/accept", json={**accept, "terms_sha256": "x"})).status_code == 409
        r = await team.post(f"/api/deposit/consent/{token}/accept", json=accept, headers={"user-agent": "LeadPhone/1.0"})
        assert r.status_code == 200 and r.json()["state"] == "given"

        # The registration form.
        assert (await _register(team, token, phone, email="nope")).status_code == 422
        assert (await _register(team, token, "9999999999")).status_code == 403
        assert (await _register(team, token, phone, active_phone="12")).status_code == 400
        r = await _register(team, token, phone, active_phone="9822200001")
        assert r.status_code == 200, r.text
        assert r.json()["registration_stage"] == "done" and r.json()["reg_phone"] == "9822200001"
        assert (await _register(team, token, phone)).status_code == 409  # already registered

    async with AsyncSession(engine) as s:
        c = (await s.execute(select(DepositConsent).where(DepositConsent.lead_id == lead_id))).scalars().one()
        assert c.match_status == "matched" and c.email == "rohit@example.com" and c.completed_at is not None

    async with _as(engine, "leader", 202) as leader:
        state = (await leader.get(f"/api/v1/deposits/leads/{lead_id}")).json()
        receipt = state["receipt"]
        assert (await leader.get(f"/api/v1/leads/{lead_id}")).json()["status"] == "day1"
        assert _RECEIPT_RE.match(receipt["receipt_number"])
        assert receipt["status"] == "held" and receipt["amount_rupees"] == 196
        assert receipt["payment_ref"] == "412345678901" and receipt["lead_city"] == "Jaipur"
        assert receipt["consent_state"] == "given"

        pdf = await leader.get(receipt["pdf_path"])
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        text = _pdf_text(pdf.content)
        for needle in (
            "Security Deposit Receipt",
            receipt["receipt_number"],
            "Rohit Kumar",
            phone,
            "Jaipur",
            "One Hundred Ninety Six Rupees Only",
            "412345678901",
            "refundable as per the deposit terms you",
            "Not a product purchase, service fee or investment",
            "Computer-generated receipt, no signature required.",
            "Myle Community",
            "Email: support@mylecommunity.in",
        ):
            assert needle in text, needle
        assert "Refundable Security Deposit Receipt" not in text and "100% refundable" not in text
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
        assert (await _upload(team, lead_id, amount=150, ref="512345678901")).status_code == 200
        token = await _link_token(team, lead_id)
        terms = (await team.post(f"/api/deposit/consent/{token}/verify", json={"phone": phone})).json()
        body = {"phone": phone, "typed_name": "Rohit", "agreed": True, "terms_sha256": terms["terms_sha256"]}

        # A browser signed in to Myle is staff — it can't agree for the lead.
        r = await team.post(f"/api/deposit/consent/{token}/accept", json=body, cookies={"myle_access": "x"})
        assert r.status_code == 403

        assert (await team.post(f"/api/deposit/consent/{token}/accept", json=body)).status_code == 200
        # Staff can't register for the lead either.
        assert (await team.post(f"/api/deposit/consent/{token}/register", data={}, cookies={"myle_access": "x"})).status_code in (403, 422)
        r = await team.post(f"/api/deposit/consent/{token}/withdraw", json={"phone": phone})
        assert r.status_code == 200 and r.json()["state"] == "withdrawn"
        assert (await _register(team, token, phone)).status_code == 400
        assert (await team.get(f"/api/v1/leads/{lead_id}")).json()["status"] == "video_watched"


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
        assert sent[0]["to"] == "rohit@example.com" and sent[0]["subject"] == "Welcome to the Myle Community family, Rohit!"
        assert "3 days of guided training" in sent[0]["html"] and "refund" not in sent[0]["text"].lower()

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


async def test_admin_can_send_to_day1_but_gets_no_win(engine):
    from app.models.win import Win

    await _seed(engine)
    async with _as(engine, "admin", 203) as admin:
        # The admin's own test lead, and a team member's lead.
        own = await _lead_at_video_watched(admin, "9811100031", name="Dummy Lead")
        await _enroll(admin, own, "9811100031", amount=149, ref="712345678931")
        assert (await admin.get(f"/api/v1/leads/{own}")).json()["status"] == "day1"
    async with _as(engine, "team", 201) as team:
        member_lead = await _lead_at_video_watched(team, "9811100032")
    async with _as(engine, "admin", 203) as admin:
        await _enroll(admin, member_lead, "9811100032", amount=149, ref="712345678932")
        assert (await admin.get(f"/api/v1/leads/{member_lead}")).json()["status"] == "day1"
    async with AsyncSession(engine) as s:
        assert (await s.execute(select(Win).where(Win.user_id == 203))).scalars().all() == []


async def test_admin_test_email_reports_the_mail_server_answer(engine, monkeypatch):
    import smtplib

    from app.services import mailer

    await _seed(engine)
    async with _as(engine, "team", 201) as team:
        assert (await team.post("/api/v1/deposits/test-email", json={"to": "a@example.com"})).status_code == 403
    async with _as(engine, "admin", 203) as admin:
        monkeypatch.setattr(mailer, "mail_configured", lambda: False)
        r = (await admin.post("/api/v1/deposits/test-email", json={"to": "a@example.com"})).json()
        assert r["ok"] is False and "SMTP_PASSWORD" in r["detail"]

        monkeypatch.setattr(mailer, "mail_configured", lambda: True)

        def _blocked(msg):
            raise TimeoutError("timed out")

        monkeypatch.setattr(mailer, "_send_sync", _blocked)
        r = (await admin.post("/api/v1/deposits/test-email", json={"to": "a@example.com"})).json()
        assert r["ok"] is False and "blocking mail ports" in r["detail"]

        def _bad_login(msg):
            raise smtplib.SMTPAuthenticationError(535, b"auth failed")

        monkeypatch.setattr(mailer, "_send_sync", _bad_login)
        r = (await admin.post("/api/v1/deposits/test-email", json={"to": "a@example.com"})).json()
        assert r["ok"] is False and "refused the login" in r["detail"]

        monkeypatch.setattr(mailer, "_send_sync", lambda msg: None)
        r = (await admin.post("/api/v1/deposits/test-email", json={"to": "a@example.com"})).json()
        assert r["ok"] is True


async def test_mismatched_screenshot_waits_for_a_leader(engine):
    await _seed(engine)
    phone = "9811100041"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        assert (await _upload(team, lead_id, ref="812345678941")).status_code == 200
        token = await _link_token(team, lead_id)
        await _agree(team, token, phone)
        r = await _register(team, token, phone, image=_other_png())
        assert r.status_code == 200 and r.json()["registration_stage"] == "mismatch"
        state = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()
        assert state["receipt"] is None and state["consent"]["match_status"] == "mismatch"
        assert state["consent"]["prospect_proof_url"] and state["consent"]["member_proof_url"]
        assert (await team.get(f"/api/v1/leads/{lead_id}")).json()["status"] == "video_watched"
        # The member can't approve their own upload.
        assert (await team.post(f"/api/v1/deposits/leads/{lead_id}/approve-registration")).status_code == 403
        # The prospect may try again with the right screenshot (max 3 tries in all).
        r = await _register(team, token, phone, image=_other_png())
        assert r.json()["registration_stage"] == "mismatch"

    # A re-upload replaces the old link; the prospect can't register on it any more.
    async with _as(engine, "team", 201) as team:
        other = await _lead_at_video_watched(team, "9811100045")
        assert (await _upload(team, other, ref="812345678945")).status_code == 200
        old_token = await _link_token(team, other)
        await _agree(team, old_token, "9811100045")
        assert (await _upload(team, other, ref="812345678946")).status_code == 200
        assert await _link_token(team, other) != old_token
        assert (await _register(team, old_token, "9811100045")).status_code == 410

    async with _as(engine, "leader", 202) as leader:
        r = await leader.post(f"/api/v1/deposits/leads/{lead_id}/approve-registration")
        assert r.status_code == 200, r.text
        assert r.json()["receipt"]["status"] == "held"
        assert r.json()["consent"]["match_status"] == "approved"
        assert (await leader.get(f"/api/v1/leads/{lead_id}")).json()["status"] == "day1"
        assert (await leader.post(f"/api/v1/deposits/leads/{lead_id}/approve-registration")).status_code == 400


async def test_ocr_transaction_id_on_a_different_screenshot_matches(engine, monkeypatch):
    from app.services import payment_proof_match

    monkeypatch.setattr(payment_proof_match, "_ocr_image_to_text", lambda data: (True, "Paid ₹196 UPI Ref No 8123 4567 8942"))
    await _seed(engine)
    phone = "9811100042"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        assert (await _upload(team, lead_id, ref="812345678942")).status_code == 200
        token = await _link_token(team, lead_id)
        await _agree(team, token, phone)
        r = await _register(team, token, phone, image=_other_png())
        assert r.json()["registration_stage"] == "done"

    # OCR reads the image but the Transaction ID isn't on it → mismatch, even for a look-alike.
    monkeypatch.setattr(payment_proof_match, "_ocr_image_to_text", lambda data: (True, "Paid ₹196 UPI Ref No 999999999999"))
    phone = "9811100043"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        assert (await _upload(team, lead_id, ref="812345678943")).status_code == 200
        token = await _link_token(team, lead_id)
        await _agree(team, token, phone)
        r = await _register(team, token, phone, image=_other_png())
        assert r.json()["registration_stage"] == "mismatch"


async def test_enrollment_sends_the_premium_welcome_email(engine, monkeypatch):
    from app.services import mailer

    sent: list[dict] = []

    async def _fake_send(**kw):
        sent.append(kw)

    monkeypatch.setattr(mailer, "mail_configured", lambda: True)
    monkeypatch.setattr(mailer, "send_email", _fake_send)
    await _seed(engine)
    phone = "9811100044"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone)
        done = await _enroll(team, lead_id, phone, ref="812345678944")
        assert done["welcome_email_sent_at"]
        receipt = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]
    assert len(sent) == 1 and sent[0]["to"] == "rohit@example.com"
    assert sent[0]["subject"] == "Welcome to Myle Community, Rohit. Your enrollment is confirmed"
    assert receipt["receipt_number"] in sent[0]["html"] and "Test leader 202" in sent[0]["html"]
    assert "refund" not in sent[0]["text"].lower()


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
        await _enroll(team, lead_id, phone, ref="612345678901")
        first = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]["receipt_number"]

        # The same Transaction ID can't back a second lead's receipt.
        other = await _lead_at_video_watched(team, "9811100007")
        r = await _upload(team, other, ref="612345678901")
        assert r.status_code == 409 and first in r.text

    async with _as(engine, "leader", 202) as leader:
        assert (await leader.post(f"/api/v1/leads/{lead_id}/send-back", json={"reason": "blurry"})).status_code == 200

    async with AsyncSession(engine) as s:
        old = (await s.execute(select(DepositReceipt).where(DepositReceipt.receipt_number == first))).scalar_one()
        assert old.status == "cancelled" and "blurry" in old.cancel_reason

    async with _as(engine, "team", 201) as team:
        # Re-enrollment (new link, agree, register) gets a NEW number; the cancelled one stays used.
        await _enroll(team, lead_id, phone, ref="612345678901")
        second = (await team.get(f"/api/v1/deposits/leads/{lead_id}")).json()["receipt"]["receipt_number"]
        assert second != first and int(second.rsplit("-", 1)[1]) > int(first.rsplit("-", 1)[1])


async def test_refund_list_search_and_public_receipt(engine):
    await _seed(engine)
    phone = "9811100008"
    async with _as(engine, "team", 201) as team:
        lead_id = await _lead_at_video_watched(team, phone, name="Sunita Devi")
        await _enroll(team, lead_id, phone, amount=200, mode="bank_transfer", ref="UTR-HDFC-778899", name="Sunita Devi")
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
            await _enroll(team, lead_id, phone, ref="102345678901")
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
        await _enroll(team, lead_id, phone, ref="112345678901")

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


def test_screenshot_survives_whatsapp_recompression_but_not_a_different_one(monkeypatch):
    from PIL import Image, ImageDraw

    from app.services import payment_proof_match as m

    monkeypatch.setattr(m, "_ocr_image_to_text", lambda data: (False, ""))  # no OCR on this server

    def shot(seed: int) -> Image.Image:
        img = Image.new("RGB", (720, 1500), (246, 246, 250))
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, 720, 260), fill=(95, 37, 159))
        d.ellipse((290, 330, 430, 470), fill=(30, 160, 90))
        for i in range(14):
            w = 200 + ((seed * 97 + i * 53) % 420)
            d.rectangle((60, 540 + i * 62, 60 + w, 566 + i * 62), fill=(60, 60, 70))
        return img

    def encode(img: Image.Image, fmt: str, **kw) -> bytes:
        buf = io.BytesIO()
        img.save(buf, format=fmt, **kw)
        return buf.getvalue()

    original = encode(shot(1), "PNG")
    forwarded = encode(shot(1).resize((540, 1125)), "JPEG", quality=55)  # WhatsApp-style
    different = encode(shot(7), "PNG")
    member = {"member_sha256": m.sha256_bytes(original), "member_dhash": m.dhash_hex(original), "payment_ref": "412345678901"}
    assert m.check_match(prospect_image=original, **member).matched
    assert m.check_match(prospect_image=forwarded, **member).matched
    assert not m.check_match(prospect_image=different, **member).matched
