"""Day 2 cheat-proof test — service + public-endpoint behaviour.

Covers: link issuance + idempotent reuse, identity gate, locked random subset,
server-side scoring (pass/fail), no-back enforcement, anti-cheat telemetry,
server-enforced timer auto-submit, and one-attempt lockout.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.day2_test_bank import (
    DAY2_TEST_BY_ID,
    PASS_MARK,
    QUESTIONS_PER_ATTEMPT,
)
from app.models.day2_test_session import Day2TestSession
from app.models.lead import Lead


_PHONE_SEQ = iter(range(9120000000, 9120009999))


async def _create_lead(admin_client: AsyncClient) -> int:
    resp = await admin_client.post(
        "/api/v1/leads",
        json={"name": "Test Prospect", "status": "new_lead", "phone": str(next(_PHONE_SEQ))},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _issue_link(admin_client: AsyncClient, lead_id: int) -> str:
    resp = await admin_client.post(f"/api/v1/leads/{lead_id}/day2-test-link")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["test_url"].endswith(f"/test/d2/{body['token']}")
    return body["token"]


async def _orders(engine, token: str) -> dict:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        row = (
            await s.execute(select(Day2TestSession).where(Day2TestSession.token == token))
        ).scalar_one()
        return {"qids": row.question_ids, "orders": row.option_orders}


def _correct_index(qid: int, order: list[str]) -> int:
    return order.index(DAY2_TEST_BY_ID[qid]["correct"])


async def _drive(admin_client: AsyncClient, engine, token: str, *, correct: bool) -> dict:
    """Answer every question. correct=True → all right; False → all wrong."""
    meta = await _orders(engine, token)
    qids, orders = meta["qids"], meta["orders"]
    state = None
    for idx, qid in enumerate(qids):
        order = orders[str(qid)]
        right = _correct_index(qid, order)
        choice = right if correct else (right + 1) % 4
        resp = await admin_client.post(
            f"/api/test/d2/{token}/answer",
            json={"question_index": idx, "choice_index": choice},
        )
        assert resp.status_code == 200, resp.text
        state = resp.json()
    return state


# ── Link issuance ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue_link_idempotent(admin_client: AsyncClient):
    lead_id = await _create_lead(admin_client)
    t1 = await _issue_link(admin_client, lead_id)
    t2 = await _issue_link(admin_client, lead_id)
    assert t1 == t2, "unused link must be reused (idempotent)"


@pytest.mark.asyncio
async def test_team_cannot_issue_link(admin_client: AsyncClient, team_client: AsyncClient):
    lead_id = await _create_lead(admin_client)
    resp = await team_client.post(f"/api/v1/leads/{lead_id}/day2-test-link")
    assert resp.status_code == 403


# ── Identity gate + locked subset ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_requires_identity(admin_client: AsyncClient):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)

    state = (await admin_client.get(f"/api/test/d2/{token}")).json()
    assert state["status"] == "created"
    assert state["question"] is None

    bad = await admin_client.post(f"/api/test/d2/{token}/start", json={"name": "x", "phone": "123"})
    assert bad.status_code == 400

    ok = await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "active"
    assert body["total"] == QUESTIONS_PER_ATTEMPT
    assert body["index"] == 0
    assert body["pass_mark"] == PASS_MARK
    assert body["question"] is not None
    # client never receives the correct answer
    assert "correct" not in body["question"]
    assert len(body["question"]["options"]) == 4


# ── Scoring: pass ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_all_correct_passes(admin_client: AsyncClient, engine):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    final = await _drive(admin_client, engine, token, correct=True)
    assert final["status"] == "submitted"
    assert final["passed"] is True
    assert final["score"] == QUESTIONS_PER_ATTEMPT

    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        assert lead.day2_test_status == "passed"
        assert lead.day2_test_score == QUESTIONS_PER_ATTEMPT
        assert lead.day2_test_attempts == 1
        assert lead.day2_test_completed_at is not None

    # passing unlocks the downloadable Day 2 business certificate (PDF)
    cert = await admin_client.get(f"/api/test/d2/{token}/certificate")
    assert cert.status_code == 200, cert.text
    assert cert.headers["content-type"] == "application/pdf"
    assert cert.content[:4] == b"%PDF"


@pytest.mark.asyncio
async def test_certificate_blocked_before_pass(admin_client: AsyncClient):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    # not started/passed yet → no certificate
    cert = await admin_client.get(f"/api/test/d2/{token}/certificate")
    assert cert.status_code == 403


# ── Scoring: fail + one-attempt lockout ───────────────────────────────────────

@pytest.mark.asyncio
async def test_all_wrong_fails_and_locks(admin_client: AsyncClient, engine):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    final = await _drive(admin_client, engine, token, correct=False)
    assert final["status"] == "submitted"
    assert final["passed"] is False
    assert final["score"] == 0

    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        assert lead.day2_test_status == "failed"

    # one attempt only — no new link after a finished attempt
    again = await admin_client.post(f"/api/v1/leads/{lead_id}/day2-test-link")
    assert again.status_code == 409
    # and the spent token cannot be restarted
    restart = await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    assert restart.status_code == 409


# ── No-back enforcement ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_back_rejects_wrong_index(admin_client: AsyncClient):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    # current_index is 0; answering index 5 must be rejected
    resp = await admin_client.post(
        f"/api/test/d2/{token}/answer", json={"question_index": 5, "choice_index": 0}
    )
    assert resp.status_code == 409


# ── Anti-cheat telemetry ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_counters(admin_client: AsyncClient, engine):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    for ev in ("blur", "blur", "hidden", "copy", "paste", "paste", "paste"):
        r = await admin_client.post(f"/api/test/d2/{token}/event", json={"type": ev})
        assert r.status_code == 200

    async with AsyncSession(engine, expire_on_commit=False) as s:
        row = (
            await s.execute(select(Day2TestSession).where(Day2TestSession.token == token))
        ).scalar_one()
        assert row.blur_count == 2
        assert row.hidden_count == 1
        assert row.copy_count == 1
        assert row.paste_count == 3


# ── Server-enforced timer ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_timer_auto_submits(admin_client: AsyncClient, engine):
    lead_id = await _create_lead(admin_client)
    token = await _issue_link(admin_client, lead_id)
    await admin_client.post(
        f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9123456780"}
    )
    # force expiry
    async with AsyncSession(engine, expire_on_commit=False) as s:
        row = (
            await s.execute(select(Day2TestSession).where(Day2TestSession.token == token))
        ).scalar_one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await s.commit()

    state = (await admin_client.get(f"/api/test/d2/{token}")).json()
    assert state["status"] == "submitted"
    # nothing answered → score 0, failed
    assert state["score"] == 0
    assert state["passed"] is False
