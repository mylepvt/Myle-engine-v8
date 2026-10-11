"""Public certificate verification (the QR code on every certificate points here).

Each certificate number gets a short verification code derived from the server's
SECRET_KEY (HMAC). The QR link carries both; verification needs both to match, so:
  - a forged or edited certificate number cannot produce a valid code, and
  - nobody can walk certificate numbers to list members' names.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.time_ist import IST
from app.models.day2_test_session import Day2TestSession
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User

_CERT_RE = re.compile(r"^MYLE/(TRN|D2)/(\d{4})/(\d{5,})$")


def normalize_cert_no(raw: str) -> str:
    return "".join((raw or "").split()).upper()


def verification_code(cert_no: str) -> str:
    """8-character code shown on the certificate as XXXX-XXXX."""
    digest = hmac.new(
        settings.secret_key.encode(), f"myle-cert:{normalize_cert_no(cert_no)}".encode(), hashlib.sha256
    ).digest()
    code = base64.b32encode(digest).decode()[:8]
    return f"{code[:4]}-{code[4:]}"


def _public_base(base_url: str) -> str:
    """Behind Render's proxy the app sees http://; the public site is https."""
    base = base_url.rstrip("/")
    host = base.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    if base.startswith("http://") and host not in {"localhost", "127.0.0.1", "testserver", "test"}:
        base = "https://" + base[len("http://"):]
    return base


def verify_url(base_url: str, cert_no: str) -> str:
    return (
        f"{_public_base(base_url)}/verify?no={quote(normalize_cert_no(cert_no), safe='')}"
        f"&c={verification_code(cert_no)}"
    )


def _codes_match(cert_no: str, code: str) -> bool:
    given = "".join((code or "").split()).upper().replace("-", "")
    expected = verification_code(cert_no).replace("-", "")
    return hmac.compare_digest(given, expected)


def _as_ist(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def _mask(value: str | None) -> str | None:
    v = (value or "").strip()
    if len(v) <= 4:
        return v or None
    return f"{v[:2]}{'•' * (len(v) - 4)}{v[-2:]}"


async def verify_certificate(session: AsyncSession, cert_no: str, code: str) -> dict[str, Any] | None:
    """Details of a genuine certificate, or None when the number/code is not valid."""
    cert_no = normalize_cert_no(cert_no)
    m = _CERT_RE.match(cert_no)
    if m is None or not _codes_match(cert_no, code):
        return None
    kind, year, ident = m.group(1), int(m.group(2)), int(m.group(3))

    if kind == "TRN":
        from app.api.v1.certificate import certificate_display_name

        user = await session.get(User, ident)
        if user is None or user.training_status != "completed":
            return None
        attempt = (
            await session.execute(
                select(TrainingTestAttempt)
                .where(TrainingTestAttempt.user_id == ident, TrainingTestAttempt.passed.is_(True))
                .order_by(TrainingTestAttempt.attempted_at.desc(), TrainingTestAttempt.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        issued = _as_ist(attempt.attempted_at) if attempt else None
        if issued is None or issued.year != year:
            return None
        total = attempt.total_questions or 0
        return {
            "certificate_no": cert_no,
            "type": "training",
            "title": "Certificate of Completion",
            "programme": "7-Day Onboarding Training Programme",
            "name": certificate_display_name(user),
            "fbo_id": _mask(user.fbo_id),
            "issued_on": issued.strftime("%d %B %Y"),
            "score": f"{attempt.score}/{total}" if total else None,
        }

    link = await session.get(Day2TestSession, ident)
    if link is None or link.status != "submitted" or not link.passed:
        return None
    issued = _as_ist(link.submitted_at)
    if issued is None or issued.year != year:
        return None
    total = len(link.question_ids or []) or 30
    return {
        "certificate_no": cert_no,
        "type": "day2",
        "title": "Certificate of Qualification",
        "programme": "Day 2 Business Evaluation",
        "name": " ".join((link.prospect_name or "Participant").split()),
        "fbo_id": None,
        "issued_on": issued.strftime("%d %B %Y"),
        "score": f"{link.score}/{total}",
    }
