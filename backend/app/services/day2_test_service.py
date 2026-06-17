"""Day 2 cheat-proof test — server-authoritative session logic.

Anti-cheat is enforced here, not on the client:
  - locked random question subset + per-question option shuffle, set at start
  - server-enforced timer (expires_at) with auto-submit
  - one-question-at-a-time, no-back (client only ever sees current question)
  - server-side scoring (correct keys never leave the bank module)
  - telemetry counters for tab-blur / page-hidden / copy / paste
"""
from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.day2_test_bank import (
    DAY2_TEST_BY_ID,
    MAX_ATTEMPTS,
    PASS_MARK,
    QUESTIONS_PER_ATTEMPT,
    TIME_LIMIT_SECONDS,
    is_choice_correct,
    public_question,
)
from app.models.day2_test_session import Day2TestSession
from app.models.lead import Lead

_OPTION_KEYS = ["A", "B", "C", "D"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class Day2TestError(Exception):
    """Raised for invalid test-session operations (maps to 4xx at the API edge)."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ── Leader/admin: issue a unique link ────────────────────────────────────────

async def create_link(
    session: AsyncSession, *, lead: Lead, created_by_user_id: int
) -> Day2TestSession:
    """Create (or reuse) the prospect's single test link.

    One attempt only: if the prospect already passed/failed a finished attempt, no new
    link is issued. An unused 'created'/'active' session is reused so re-sharing the
    link is idempotent.
    """
    if (lead.day2_test_status or "pending") in {"passed", "failed"}:
        raise Day2TestError("Test already completed for this lead", status_code=409)
    if (lead.day2_test_attempts or 0) >= MAX_ATTEMPTS and (
        lead.day2_test_status or "pending"
    ) != "pending":
        raise Day2TestError("No attempts remaining", status_code=409)

    existing = (
        await session.execute(
            select(Day2TestSession)
            .where(
                Day2TestSession.lead_id == lead.id,
                Day2TestSession.status.in_(("created", "active")),
            )
            .order_by(Day2TestSession.id.desc())
        )
    ).scalars().first()
    if existing is not None:
        return existing

    link = Day2TestSession(
        token=secrets.token_urlsafe(24),
        lead_id=lead.id,
        created_by_user_id=created_by_user_id,
        attempt_no=(lead.day2_test_attempts or 0) + 1,
        status="created",
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


# ── Public: pass certificate ─────────────────────────────────────────────────

async def certificate_pdf(session: AsyncSession, token: str) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename) for a PASSED test. Raises if not passed."""
    from app.services.day2_certificate_pdf import build_day2_business_certificate_pdf

    link = await _get_by_token(session, token)
    if link.status != "submitted" or not link.passed:
        raise Day2TestError("Certificate available only after passing the test", status_code=403)
    total = len(link.question_ids or []) or QUESTIONS_PER_ATTEMPT
    name = (link.prospect_name or "Participant").strip() or "Participant"
    when = _as_aware(link.submitted_at) or _now()
    date_display = when.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %B %Y")
    pdf = build_day2_business_certificate_pdf(
        recipient_name=name,
        score=int(link.score or 0),
        total_questions=total,
        date_display=date_display,
    )
    safe = "".join(ch for ch in name if ch.isalnum() or ch in " -_").strip().replace(" ", "_") or "certificate"
    return pdf, f"day2_certificate_{safe}.pdf"


# ── Public: load session by token ────────────────────────────────────────────

async def _get_by_token(session: AsyncSession, token: str) -> Day2TestSession:
    row = (
        await session.execute(
            select(Day2TestSession).where(Day2TestSession.token == token)
        )
    ).scalar_one_or_none()
    if row is None:
        raise Day2TestError("Invalid or expired test link", status_code=404)
    return row


def _is_expired(link: Day2TestSession) -> bool:
    exp = _as_aware(link.expires_at)
    return link.status == "active" and exp is not None and _now() >= exp


def _time_left_seconds(link: Day2TestSession) -> int:
    exp = _as_aware(link.expires_at)
    if exp is None:
        return TIME_LIMIT_SECONDS
    return max(0, int((exp - _now()).total_seconds()))


def _score(link: Day2TestSession) -> int:
    answers: dict[str, Any] = link.answers or {}
    orders: dict[str, Any] = link.option_orders or {}
    total = 0
    for qid in link.question_ids or []:
        chosen = answers.get(str(qid))
        order = orders.get(str(qid))
        if chosen is None or order is None:
            continue
        if is_choice_correct(qid, order, int(chosen)):
            total += 1
    return total


async def _finalize(session: AsyncSession, link: Day2TestSession) -> Day2TestSession:
    score = _score(link)
    passed = score >= PASS_MARK
    link.score = score
    link.passed = passed
    link.status = "submitted"
    link.submitted_at = _now()

    lead = await session.get(Lead, link.lead_id)
    if lead is not None:
        lead.day2_test_status = "passed" if passed else "failed"
        lead.day2_test_score = score
        lead.day2_test_completed_at = _now()
    await session.commit()
    await session.refresh(link)
    return link


# ── Public: state ────────────────────────────────────────────────────────────

def _public_state(link: Day2TestSession) -> dict[str, Any]:
    total = len(link.question_ids or []) or QUESTIONS_PER_ATTEMPT
    state: dict[str, Any] = {
        "status": link.status,
        "total": total,
        "index": link.current_index,
        "pass_mark": PASS_MARK,
        "time_limit_seconds": TIME_LIMIT_SECONDS,
        "time_left_seconds": _time_left_seconds(link),
        "prospect_name": link.prospect_name,
    }
    if link.status == "submitted":
        state["score"] = link.score
        state["passed"] = bool(link.passed)
        state["question"] = None
        return state
    if link.status == "active":
        qids = link.question_ids or []
        if link.current_index < len(qids):
            qid = qids[link.current_index]
            order = (link.option_orders or {}).get(str(qid), _OPTION_KEYS)
            state["question"] = public_question(qid, order)
        else:
            state["question"] = None
    else:  # created — needs prospect identity before unlocking
        state["question"] = None
    return state


async def get_state(session: AsyncSession, token: str) -> dict[str, Any]:
    link = await _get_by_token(session, token)
    if _is_expired(link):
        link = await _finalize(session, link)
    return _public_state(link)


# ── Public: start (identity gate → lock subset) ──────────────────────────────

async def start(
    session: AsyncSession, token: str, *, prospect_name: str, prospect_phone: str
) -> dict[str, Any]:
    link = await _get_by_token(session, token)
    if link.status == "submitted":
        raise Day2TestError("Test already submitted", status_code=409)
    if link.status == "active":
        # idempotent resume — already started, just return current state
        if _is_expired(link):
            link = await _finalize(session, link)
        return _public_state(link)

    name = (prospect_name or "").strip()
    phone = "".join(ch for ch in (prospect_phone or "") if ch.isdigit())
    if len(name) < 2:
        raise Day2TestError("Please enter your full name", status_code=400)
    if len(phone) < 10:
        raise Day2TestError("Please enter a valid phone number", status_code=400)

    pool = list(DAY2_TEST_BY_ID.keys())
    n = min(QUESTIONS_PER_ATTEMPT, len(pool))
    qids = random.sample(pool, n)
    orders: dict[str, list[str]] = {}
    for qid in qids:
        keys = _OPTION_KEYS[:]
        random.shuffle(keys)
        orders[str(qid)] = keys

    now = _now()
    link.question_ids = qids
    link.option_orders = orders
    link.answers = {}
    link.current_index = 0
    link.prospect_name = name
    link.prospect_phone = phone
    link.status = "active"
    link.started_at = now
    link.expires_at = now + timedelta(seconds=TIME_LIMIT_SECONDS)

    lead = await session.get(Lead, link.lead_id)
    if lead is not None:
        lead.day2_test_status = "in_progress"
        lead.day2_test_attempts = (lead.day2_test_attempts or 0) + 1
    await session.commit()
    await session.refresh(link)
    return _public_state(link)


# ── Public: answer (no-back, advance) ────────────────────────────────────────

async def answer(
    session: AsyncSession, token: str, *, question_index: int, choice_index: int
) -> dict[str, Any]:
    link = await _get_by_token(session, token)
    if _is_expired(link):
        link = await _finalize(session, link)
        return _public_state(link)
    if link.status != "active":
        raise Day2TestError("Test is not active", status_code=409)
    if question_index != link.current_index:
        # no-back / no-skip: only the current question is answerable
        raise Day2TestError("Unexpected question index", status_code=409)

    qids = link.question_ids or []
    if question_index < 0 or question_index >= len(qids):
        raise Day2TestError("Question out of range", status_code=400)
    if choice_index not in (0, 1, 2, 3):
        raise Day2TestError("Invalid choice", status_code=400)

    qid = qids[question_index]
    answers = dict(link.answers or {})
    answers[str(qid)] = choice_index
    link.answers = answers
    link.current_index = question_index + 1

    if link.current_index >= len(qids):
        link = await _finalize(session, link)
        return _public_state(link)

    await session.commit()
    await session.refresh(link)
    return _public_state(link)


# ── Public: anti-cheat telemetry ─────────────────────────────────────────────

_EVENT_FIELDS = {
    "blur": "blur_count",
    "hidden": "hidden_count",
    "copy": "copy_count",
    "paste": "paste_count",
}


async def record_event(session: AsyncSession, token: str, *, event_type: str) -> dict[str, Any]:
    link = await _get_by_token(session, token)
    field = _EVENT_FIELDS.get(event_type)
    if field is None:
        raise Day2TestError("Unknown event type", status_code=400)
    if link.status == "active":
        setattr(link, field, int(getattr(link, field) or 0) + 1)
        await session.commit()
    return {"ok": True}


# ── Public: explicit finalize (e.g. timer hits 0 client-side) ────────────────

async def finalize(session: AsyncSession, token: str) -> dict[str, Any]:
    link = await _get_by_token(session, token)
    if link.status == "submitted":
        return _public_state(link)
    if link.status != "active":
        raise Day2TestError("Test not started", status_code=409)
    link = await _finalize(session, link)
    return _public_state(link)
