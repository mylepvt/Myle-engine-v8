"""Refundable security deposit (₹149–200 at enrollment): the lead's consent, the receipt, the gate.

What it is: a 100% refundable deposit a prospect pays at enrollment to show they are
serious. It is NOT a sale, so it gets a receipt (no tax invoice, no GST). It has no link to
Forever / FLP billing, products, lead sales, the wallet or the invoice series — this module
imports none of them.

Flow:
1. A member sends the lead a consent link (``create_consent_link``) on WhatsApp.
2. The lead opens it, re-enters their registered mobile, reads the terms, ticks "I agree"
   and types their full name (``accept_consent``). The exact text, its hash, the time,
   IP and browser are stored; a browser signed in to Myle (staff) can't agree for them.
3. The lead pays; the member uploads the screenshot with the payment mode and Transaction
   ID. ``issue_receipt_for_enrollment`` (same transaction as the upload) checks the consent
   and payment details and issues ``MYLE-DEP-<year>-<seq>``.
4. Gate: with ``deposit.gate_enabled`` on (default), a lead can't move past the pre-enrollment
   stages without a live receipt (``ensure_can_leave_pre_enrollment``).
5. Proof sent back → receipt cancelled (number kept). Refund → status ``refunded`` with date
   and refund transaction id. Every change also goes to Myle Ledger (``deposit_ledger``).
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.core.time_ist import IST, now_ist
from app.models.activity_log import ActivityLog
from app.models.app_setting import AppSetting
from app.models.deposit import DepositConsent, DepositReceipt
from app.models.lead import Lead
from app.services import deposit_ledger

MIN_RUPEES = 149
MAX_RUPEES = 200

CONSENT_LINK_TTL = timedelta(hours=48)
MAX_PHONE_ATTEMPTS = 5
MAX_PAYMENT_AGE = timedelta(days=30)
FUTURE_SKEW = timedelta(minutes=10)

# Pre-enrollment stages; leaving them for one of POST_ENROLLMENT_STATUSES needs a live receipt.
PRE_ENROLLMENT_STATUSES = frozenset(
    {"new_lead", "new", "contacted", "invited", "whatsapp_sent", "video_sent", "video_watched"}
)
POST_ENROLLMENT_STATUSES = frozenset({"day1", "day2", "day3", "converted", "training"})

PAYMENT_MODES: dict[str, str] = {
    "upi": "UPI",
    "bank_transfer": "Bank transfer (IMPS / NEFT / RTGS)",
    "card": "Debit / credit card",
    "other_online": "Other online payment",
}

SETTING_GATE = "deposit.gate_enabled"
SETTING_BUSINESS_NAME = "deposit.business_name"
SETTING_SUPPORT_EMAIL = "deposit.support_email"
SETTING_OPERATED_BY = "deposit.operated_by"
DEFAULT_BUSINESS_NAME = "Myle Community"
# The only contact on the receipt and the lead's pages (no address or phone number).
DEFAULT_SUPPORT_EMAIL = "support@mylecommunity.in"

PURPOSE_LINE = (
    "Refundable security deposit for enrollment. Not a product purchase or service fee, "
    "and not linked to any other service."
)
REFUND_LINE = "This deposit is 100% refundable."
NO_SIGNATURE_LINE = "Computer-generated receipt, no signature required."

TERMS_VERSION = "v1"
_TERMS_V1 = """YOUR SECURITY DEPOSIT - SIMPLE AND FULLY REFUNDABLE

Hi {name} (mobile {phone}),

Thank you for choosing to enroll with {business}. Here is everything about your deposit, in simple words:

1. Amount: you are paying a security deposit of Rs. {amount} ({words}) to {business} for your enrollment.
2. Why a deposit: it only confirms your enrollment and shows you are serious about joining. It is not a product purchase, not a service fee and not an investment, and it is not linked to any other company, product or service.
3. 100% refundable: whenever you ask for a refund, the full amount is returned to you.
4. Clear and honest: no income, earnings or returns have been promised to you in exchange for this deposit.
5. Your details stay safe: we keep your name, mobile number, city and payment details (payment mode, transaction ID, date) only to record this deposit, send your receipt and process your refund, including in our internal records. We never use them for anything else.
6. Always your choice: you can withdraw this consent at any time from this same link. If you do, your deposit is refunded and your enrollment does not continue.

By tapping "I Agree", I confirm that I have read the above and I agree of my own free will.

---

नमस्ते {name} (मोबाइल {phone}),

{business} के साथ जुड़ने के लिए धन्यवाद। आपकी deposit के बारे में सब कुछ, आसान शब्दों में:

1. रकम: आप अपने enrollment के लिए {business} को ₹{amount} ({words}) की security deposit दे रहे हैं।
2. Deposit क्यों: यह सिर्फ़ आपका enrollment पक्का करती है और दिखाती है कि आप जुड़ने को लेकर गंभीर हैं। यह किसी product की खरीद, service fee या investment नहीं है, और किसी दूसरी company, product या service से जुड़ी नहीं है।
3. 100% refundable: जब भी आप refund माँगेंगे, पूरी रकम आपको वापस मिलेगी।
4. साफ़ और ईमानदार: इस deposit के बदले आपसे किसी income, कमाई या return का वादा नहीं किया गया है।
5. आपकी जानकारी सुरक्षित: आपका नाम, मोबाइल नंबर, शहर और payment details (payment mode, transaction ID, तारीख) हम सिर्फ़ इस deposit का record रखने, आपकी receipt भेजने और refund करने के लिए रखते हैं, अपने internal records में भी। इनका किसी और काम में कभी इस्तेमाल नहीं होता।
6. फ़ैसला हमेशा आपका: आप इसी link से कभी भी अपनी सहमति वापस ले सकते हैं। ऐसा करने पर आपकी deposit refund होगी और enrollment आगे नहीं बढ़ेगा।

"I Agree" दबाकर मैं पुष्टि करता/करती हूँ कि मैंने ऊपर लिखी बातें पढ़ ली हैं और अपनी मर्ज़ी से सहमत हूँ।
"""


class DepositError(HTTPException):
    def __init__(self, detail: str, status_code: int = http_status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(status_code=status_code, detail=detail)


# ── small helpers ─────────────────────────────────────────────────────────────

_ONES = (
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def rupees_in_words(rupees: int) -> str:
    """196 → "One Hundred Ninety Six Rupees Only" (deposits are whole rupees, < ₹1,000)."""
    n = int(rupees)
    if not 0 < n < 1000:
        raise ValueError("deposit amount out of range")
    parts = []
    if n >= 100:
        parts.append(f"{_ONES[n // 100]} Hundred")
        n %= 100
    if n >= 20:
        parts.append(_TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else ""))
    elif n:
        parts.append(_ONES[n])
    return " ".join(parts) + " Rupees Only"


def phone10(raw: str | None) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    return digits[-10:] if len(digits) >= 10 else None


def mask_phone(raw: str | None) -> str:
    p = phone10(raw) or ""
    return f"XXXXXX{p[-4:]}" if p else ""


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def fmt_ist(dt: datetime | None) -> str:
    return _aware(dt).astimezone(IST).strftime("%d %b %Y, %I:%M %p IST") if dt else ""


def client_ip(request: Request) -> str | None:
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = fwd or (request.client.host if request.client else "")
    return ip[:64] or None


def normalize_payment_ref(mode: str, raw: str | None) -> str:
    """The Transaction ID / Payment Ref No., checked for its mode. Raises on a bad one."""
    if mode not in PAYMENT_MODES:
        raise DepositError("Choose how the deposit was paid.")
    ref = re.sub(r"\s+", "", raw or "").upper()
    if not ref:
        raise DepositError("Enter the Transaction ID / Payment Ref No. from the payment screen.")
    if mode == "upi":
        if not re.fullmatch(r"\d{12}", ref):
            raise DepositError("UPI Ref No. (UTR) is the 12-digit number on the payment screen.")
    elif not re.fullmatch(r"[A-Z0-9][A-Z0-9/\-]{5,39}", ref):
        raise DepositError("Transaction ID / Payment Ref No. should be 6–40 letters or digits.")
    return ref


# ── settings ──────────────────────────────────────────────────────────────────


async def _setting(session: AsyncSession, key: str) -> str | None:
    row = await session.get(AppSetting, key)
    return row.value if row is not None else None


async def gate_enabled(session: AsyncSession) -> bool:
    return (await _setting(session, SETTING_GATE) or "1").strip() != "0"


async def business_details(session: AsyncSession) -> dict[str, str]:
    return {
        "name": (await _setting(session, SETTING_BUSINESS_NAME) or "").strip() or DEFAULT_BUSINESS_NAME,
        "email": (await _setting(session, SETTING_SUPPORT_EMAIL) or "").strip() or DEFAULT_SUPPORT_EMAIL,
        "operated_by": (await _setting(session, SETTING_OPERATED_BY) or "").strip(),
    }


async def save_settings(session: AsyncSession, values: dict[str, str | None]) -> None:
    for key, value in values.items():
        if value is None:
            continue
        row = await session.get(AppSetting, key)
        if row is None:
            session.add(AppSetting(key=key, value=value.strip()))
        else:
            row.value = value.strip()


# ── consent ───────────────────────────────────────────────────────────────────


def render_terms(*, name: str, phone: str, amount_rupees: int, business: str) -> str:
    return _TERMS_V1.format(
        name=name,
        phone=phone,
        amount=amount_rupees,
        words=rupees_in_words(amount_rupees),
        business=business,
    )


def sha256_hex(text_value: str) -> str:
    return hashlib.sha256(text_value.encode("utf-8")).hexdigest()


def evidence_hash(c: DepositConsent) -> str:
    """Seals the consent record: any later edit to these fields no longer matches."""
    doc = {
        "consent_id": c.id,
        "lead_id": c.lead_id,
        "amount_cents": c.amount_cents,
        "terms_version": c.terms_version,
        "terms_sha256": c.terms_sha256,
        "typed_name": c.typed_name,
        "verified_phone": c.verified_phone,
        "given_at": _aware(c.given_at).isoformat() if c.given_at else None,
        "ip_address": c.ip_address,
        "user_agent": c.user_agent,
    }
    return sha256_hex(json.dumps(doc, sort_keys=True, ensure_ascii=False))


def consent_state(c: DepositConsent, now: datetime | None = None) -> str:
    """pending | given | withdrawn | expired | replaced."""
    if c.status == "pending" and _aware(c.expires_at) <= (now or datetime.now(timezone.utc)):
        return "expired"
    return c.status


async def latest_consent(session: AsyncSession, lead_id: int) -> DepositConsent | None:
    return (
        await session.execute(
            select(DepositConsent).where(DepositConsent.lead_id == lead_id).order_by(DepositConsent.id.desc()).limit(1)
        )
    ).scalar_one_or_none()


async def active_consent(session: AsyncSession, lead_id: int) -> DepositConsent | None:
    """The newest consent the lead has given and not withdrawn."""
    return (
        await session.execute(
            select(DepositConsent)
            .where(DepositConsent.lead_id == lead_id, DepositConsent.status == "given")
            .order_by(DepositConsent.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def create_consent_link(session: AsyncSession, *, lead: Lead, amount_rupees: int, actor_id: int) -> DepositConsent:
    if not (MIN_RUPEES <= int(amount_rupees) <= MAX_RUPEES):
        raise DepositError(f"Deposit must be between ₹{MIN_RUPEES} and ₹{MAX_RUPEES}.")
    phone = phone10(lead.phone)
    if not phone:
        raise DepositError("Add the lead's 10-digit mobile number first.")
    if not (lead.name or "").strip():
        raise DepositError("Add the lead's name first.")
    if await live_receipt(session, lead.id) is not None:
        raise DepositError("This lead already has a deposit receipt.")
    business = (await business_details(session))["name"]
    now = datetime.now(timezone.utc)
    # A newer link replaces any link the lead hasn't answered yet.
    for old in (
        await session.execute(
            select(DepositConsent).where(DepositConsent.lead_id == lead.id, DepositConsent.status == "pending")
        )
    ).scalars():
        old.status = "replaced"
    terms = render_terms(name=lead.name.strip(), phone=phone, amount_rupees=int(amount_rupees), business=business)
    consent = DepositConsent(
        lead_id=lead.id,
        token=secrets.token_urlsafe(24),
        amount_cents=int(amount_rupees) * 100,
        created_by_user_id=actor_id,
        created_at=now,
        expires_at=now + CONSENT_LINK_TTL,
        status="pending",
        payer_name=lead.name.strip(),
        payer_phone=phone,
        payer_city=(lead.city or "").strip() or None,
        terms_version=TERMS_VERSION,
        terms_text=terms,
        terms_sha256=sha256_hex(terms),
    )
    session.add(consent)
    await session.flush()
    _log(session, actor_id, "deposit.consent_link_created", lead.id, {"consent_id": consent.id, "amount_cents": consent.amount_cents})
    return consent


async def consent_by_token(session: AsyncSession, token: str, *, for_update: bool = False) -> DepositConsent:
    stmt = select(DepositConsent).where(DepositConsent.token == (token or "").strip())
    if for_update:
        stmt = stmt.with_for_update()
    c = (await session.execute(stmt)).scalar_one_or_none()
    if c is None:
        raise DepositError("This link is not valid.", http_status.HTTP_404_NOT_FOUND)
    return c


async def check_consent_phone(session: AsyncSession, c: DepositConsent, raw_phone: str | None) -> None:
    """The lead must re-enter their registered mobile; 5 wrong tries lock the link."""
    if c.failed_attempts >= MAX_PHONE_ATTEMPTS:
        raise DepositError("Too many wrong numbers. Ask for a new link.", http_status.HTTP_429_TOO_MANY_REQUESTS)
    if phone10(raw_phone) != c.payer_phone:
        c.failed_attempts += 1
        await session.commit()
        raise DepositError("This number doesn't match. Enter the mobile number this link was sent to.", http_status.HTTP_403_FORBIDDEN)


async def accept_consent(
    session: AsyncSession,
    *,
    consent: DepositConsent,
    typed_name: str,
    agreed: bool,
    terms_sha256: str,
    ip: str | None,
    user_agent: str | None,
) -> DepositConsent:
    state = consent_state(consent)
    if state == "given":
        return consent
    if state == "withdrawn":
        raise DepositError("You withdrew your consent on this link. Ask for a new link to agree again.", http_status.HTTP_410_GONE)
    if state != "pending":
        raise DepositError("This link has expired. Ask for a new link.", http_status.HTTP_410_GONE)
    if not agreed:
        raise DepositError("Tick the box to agree.")
    name = re.sub(r"\s+", " ", typed_name or "").strip()
    if len(name) < 2:
        raise DepositError("Type your full name.")
    if terms_sha256 != consent.terms_sha256:
        raise DepositError("These terms have changed. Reload the page and read them again.", http_status.HTTP_409_CONFLICT)
    consent.status = "given"
    consent.given_at = datetime.now(timezone.utc)
    consent.typed_name = name[:200]
    consent.verified_phone = consent.payer_phone
    consent.ip_address = ip
    consent.user_agent = (user_agent or "")[:500] or None
    consent.evidence_sha256 = evidence_hash(consent)
    _log(
        session,
        consent.created_by_user_id,
        "deposit.consent_given",
        consent.lead_id,
        {"consent_id": consent.id, "by": "lead", "evidence_sha256": consent.evidence_sha256},
    )
    deposit_ledger.queue(session, "deposit.consent_given", consent=consent_record(consent))
    return consent


async def withdraw_consent(
    session: AsyncSession, *, consent: DepositConsent, ip: str | None, user_agent: str | None
) -> DepositConsent:
    if consent.status != "given":
        raise DepositError("There is no consent to withdraw on this link.")
    consent.status = "withdrawn"
    consent.withdrawn_at = datetime.now(timezone.utc)
    consent.withdraw_ip = ip
    consent.withdraw_user_agent = (user_agent or "")[:500] or None
    _log(session, consent.created_by_user_id, "deposit.consent_withdrawn", consent.lead_id, {"consent_id": consent.id, "by": "lead"})
    deposit_ledger.queue(session, "deposit.consent_withdrawn", consent=consent_record(consent))
    return consent


def consent_record(c: DepositConsent) -> dict[str, Any]:
    """The consent as evidence (what the lead agreed to, and how it was verified)."""
    return {
        "consent_id": c.id,
        "lead_id": c.lead_id,
        "status": c.status,
        "amount_paise": c.amount_cents,
        "payer_name": c.payer_name,
        "payer_phone": c.payer_phone,
        "payer_city": c.payer_city,
        "terms_version": c.terms_version,
        "terms_sha256": c.terms_sha256,
        "terms_text": c.terms_text,
        "link_sent_at": _aware(c.created_at).isoformat() if c.created_at else None,
        "given_at": _aware(c.given_at).isoformat() if c.given_at else None,
        "typed_name": c.typed_name,
        "verified_phone": c.verified_phone,
        "ip_address": c.ip_address,
        "user_agent": c.user_agent,
        "evidence_sha256": c.evidence_sha256,
        "withdrawn_at": _aware(c.withdrawn_at).isoformat() if c.withdrawn_at else None,
    }


# ── receipts ──────────────────────────────────────────────────────────────────


async def live_receipt(session: AsyncSession, lead_id: int) -> DepositReceipt | None:
    return (
        await session.execute(
            select(DepositReceipt)
            .where(DepositReceipt.lead_id == lead_id, DepositReceipt.status != "cancelled")
            .order_by(DepositReceipt.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _locked_counter(session: AsyncSession, key: str) -> AppSetting:
    stmt = select(AppSetting).where(AppSetting.key == key).with_for_update()
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    try:
        async with session.begin_nested():
            session.add(AppSetting(key=key, value="0"))
    except IntegrityError:
        pass  # another request created it first — lock theirs
    return (await session.execute(stmt)).scalar_one()


async def allocate_receipt_number(session: AsyncSession) -> str:
    """MYLE-DEP-2026-0001 — own counter per calendar year (IST), row-locked, never reused."""
    year = now_ist().year
    row = await _locked_counter(session, f"deposit_receipt_counter:{year}")
    seq = int(row.value or 0) + 1
    row.value = str(seq)
    await session.flush()
    return f"MYLE-DEP-{year}-{seq:04d}"


def _check_paid_at(paid_at: datetime | None) -> datetime:
    if paid_at is None:
        raise DepositError("Enter the date and time of the payment.")
    paid = _aware(paid_at)
    now = datetime.now(timezone.utc)
    if paid > now + FUTURE_SKEW:
        raise DepositError("Payment time can't be in the future.")
    if paid < now - MAX_PAYMENT_AGE:
        raise DepositError("Payment is more than 30 days old. Check the date.")
    return paid


async def issue_receipt(
    session: AsyncSession,
    *,
    lead: Lead,
    amount_cents: int,
    payment_mode: str,
    payment_ref: str | None,
    paid_at: datetime | None,
    actor_id: int | None,
) -> DepositReceipt:
    """Checks consent + payment details and issues the receipt (caller commits)."""
    if await live_receipt(session, lead.id) is not None:
        raise DepositError("This lead already has a deposit receipt.", http_status.HTTP_409_CONFLICT)
    rupees, paise = divmod(int(amount_cents or 0), 100)
    if paise or not (MIN_RUPEES <= rupees <= MAX_RUPEES):
        raise DepositError(f"Deposit must be between ₹{MIN_RUPEES} and ₹{MAX_RUPEES}.")
    consent = await active_consent(session, lead.id)
    if consent is None:
        raise DepositError("The lead hasn't given consent yet. Send the consent link and wait for them to agree.")
    if consent.amount_cents != int(amount_cents):
        raise DepositError(
            f"The lead agreed to ₹{consent.amount_cents // 100}, not ₹{rupees}. Send a new consent link for ₹{rupees}."
        )
    ref = normalize_payment_ref(payment_mode, payment_ref)
    paid = _check_paid_at(paid_at)
    clash = (
        await session.execute(
            select(DepositReceipt.receipt_number).where(
                DepositReceipt.payment_ref == ref, DepositReceipt.status != "cancelled"
            )
        )
    ).scalar_one_or_none()
    if clash:
        raise DepositError(f"This Transaction ID is already on receipt {clash}.", http_status.HTTP_409_CONFLICT)

    number = await allocate_receipt_number(session)
    business = await business_details(session)
    receipt = DepositReceipt(
        receipt_number=number,
        lead_id=lead.id,
        consent_id=consent.id,
        issued_by_user_id=actor_id,
        issued_at=datetime.now(timezone.utc),
        amount_cents=int(amount_cents),
        paid_at=paid,
        payment_mode=payment_mode,
        payment_ref=ref,
        status="held",
        share_token=secrets.token_urlsafe(24),
        payload_json={
            "business": business,
            "payer": {
                "name": (lead.name or consent.payer_name).strip(),
                "phone": phone10(lead.phone) or consent.payer_phone,
                "city": (lead.city or consent.payer_city or "").strip(),
            },
            "amount_words": rupees_in_words(rupees),
            "payment_mode_label": PAYMENT_MODES[payment_mode],
            "consent": {
                "id": consent.id,
                "given_at": _aware(consent.given_at).isoformat() if consent.given_at else None,
                "terms_version": consent.terms_version,
                "evidence_sha256": consent.evidence_sha256,
            },
        },
    )
    session.add(receipt)
    await session.flush()
    _log(session, actor_id, "deposit.receipt_issued", lead.id, {"receipt_number": number, "amount_cents": receipt.amount_cents})
    deposit_ledger.queue(session, "deposit.receipt_issued", receipt=receipt_record(receipt), consent=consent_record(consent))
    return receipt


async def cancel_live_receipt(session: AsyncSession, *, lead_id: int, reason: str, actor_id: int | None) -> DepositReceipt | None:
    """Enrollment proof sent back → its receipt is void; the number stays used."""
    receipt = await live_receipt(session, lead_id)
    if receipt is None or receipt.status != "held":
        return None
    receipt.status = "cancelled"
    receipt.cancelled_at = datetime.now(timezone.utc)
    receipt.cancel_reason = (reason or "")[:300] or None
    _log(session, actor_id, "deposit.receipt_cancelled", lead_id, {"receipt_number": receipt.receipt_number})
    deposit_ledger.queue(session, "deposit.receipt_cancelled", receipt=receipt_record(receipt))
    return receipt


async def mark_refunded(
    session: AsyncSession,
    *,
    receipt: DepositReceipt,
    refunded_at: datetime,
    refund_ref: str,
    note: str | None,
    actor_id: int,
) -> DepositReceipt:
    if receipt.status != "held":
        raise DepositError(f"Only a held deposit can be refunded (this one is {receipt.status}).")
    ref = re.sub(r"\s+", "", refund_ref or "").upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9/\-]{5,39}", ref):
        raise DepositError("Enter the refund Transaction ID / Payment Ref No. (6–40 letters or digits).")
    when = _aware(refunded_at)
    if when > datetime.now(timezone.utc) + FUTURE_SKEW:
        raise DepositError("Refund date can't be in the future.")
    if when < _aware(receipt.paid_at) - timedelta(days=1):
        raise DepositError("Refund date can't be before the deposit was paid.")
    receipt.status = "refunded"
    receipt.refunded_at = when
    receipt.refund_ref = ref
    receipt.refund_note = (note or "").strip()[:300] or None
    receipt.refunded_by_user_id = actor_id
    _log(session, actor_id, "deposit.refunded", receipt.lead_id, {"receipt_number": receipt.receipt_number, "refund_ref": ref})
    deposit_ledger.queue(session, "deposit.refunded", receipt=receipt_record(receipt))
    return receipt


def receipt_record(r: DepositReceipt) -> dict[str, Any]:
    p = r.payload_json or {}
    return {
        "receipt_number": r.receipt_number,
        "lead_id": r.lead_id,
        "consent_id": r.consent_id,
        "status": r.status,
        "amount_paise": r.amount_cents,
        "payer_name": (p.get("payer") or {}).get("name"),
        "payer_phone": (p.get("payer") or {}).get("phone"),
        "payer_city": (p.get("payer") or {}).get("city"),
        "payment_mode": r.payment_mode,
        "payment_mode_label": p.get("payment_mode_label") or PAYMENT_MODES.get(r.payment_mode, r.payment_mode),
        "payment_ref": r.payment_ref,
        "amount_words": p.get("amount_words"),
        # What the receipt shows as the receiver, so the Ledger's copy reads the same.
        "business": p.get("business") or {},
        "paid_at": _aware(r.paid_at).isoformat(),
        "issued_at": _aware(r.issued_at).isoformat() if r.issued_at else None,
        "refunded_at": _aware(r.refunded_at).isoformat() if r.refunded_at else None,
        "refund_ref": r.refund_ref,
        "refund_note": r.refund_note,
        "cancelled_at": _aware(r.cancelled_at).isoformat() if r.cancelled_at else None,
        "cancel_reason": r.cancel_reason,
    }


async def search_receipts(
    session: AsyncSession, *, q: str | None, status: str | None, limit: int, offset: int
) -> tuple[list[DepositReceipt], int]:
    stmt = select(DepositReceipt)
    if status:
        stmt = stmt.where(DepositReceipt.status == status)
    term = (q or "").strip()
    if term:
        lead_ids = select(Lead.id).where(or_(Lead.name.ilike(f"%{term}%"), Lead.phone.ilike(f"%{term}%")))
        digits = re.sub(r"\D", "", term)
        conds = [
            DepositReceipt.receipt_number.ilike(f"%{term}%"),
            DepositReceipt.payment_ref.ilike(f"%{term}%"),
            DepositReceipt.lead_id.in_(lead_ids),
        ]
        if len(digits) >= 4:
            conds.append(DepositReceipt.lead_id.in_(select(Lead.id).where(Lead.phone.ilike(f"%{digits}%"))))
        stmt = stmt.where(or_(*conds))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await session.execute(stmt.order_by(DepositReceipt.id.desc()).limit(limit).offset(offset))
    ).scalars().all()
    return list(rows), int(total)


# ── the gate ──────────────────────────────────────────────────────────────────


async def ensure_can_leave_pre_enrollment(session: AsyncSession, *, lead: Lead, target_status: str) -> None:
    """A lead can't go past the pre-enrollment stages without a held deposit receipt
    (which itself needs the lead's consent and valid payment details)."""
    if lead.status not in PRE_ENROLLMENT_STATUSES or target_status not in POST_ENROLLMENT_STATUSES:
        return
    if not await gate_enabled(session):
        return
    receipt = await live_receipt(session, lead.id)
    if receipt is None or receipt.status != "held":
        raise DepositError(
            "Security deposit pending: the lead's consent and the deposit receipt are needed before Day 1. "
            "Use “Send to Day 1” to upload the payment."
        )
    consent = await session.get(DepositConsent, receipt.consent_id)
    if consent is None or consent.status != "given":
        raise DepositError("The lead has withdrawn their deposit consent, so this lead can't move ahead.")


def _log(session: AsyncSession, user_id: int | None, action: str, lead_id: int, meta: dict[str, Any]) -> None:
    if user_id is None:  # the activity log needs an actor; the deposit tables keep the record anyway
        return
    session.add(ActivityLog(user_id=user_id, action=action, entity_type="lead", entity_id=lead_id, meta=meta))
