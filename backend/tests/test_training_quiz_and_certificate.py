"""Final quiz guards, admin question bank, and certificate download."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.training_progress import TrainingProgress
from app.models.training_question import TrainingQuestion
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.training_video import TrainingVideo
from app.models.user import User

TEAM_ID = 201


@pytest.fixture
async def clean(engine):
    async def _wipe():
        async with AsyncSession(engine) as s:
            for model in (TrainingTestAttempt, TrainingProgress, TrainingQuestion, TrainingVideo):
                await s.execute(delete(model))
            await s.commit()

    await _wipe()
    async with AsyncSession(engine, expire_on_commit=False) as s:
        u = await s.get(User, TEAM_ID)
        if u is None:
            u = User(id=TEAM_ID, fbo_id="T00201", email="team201@test.myle", role="team")
            s.add(u)
        u.name = "rahul sharma"
        u.username = None
        u.training_status = "pending"
        await s.commit()
    yield
    await _wipe()


async def _seed_quiz(engine, *, days_done: bool) -> list[TrainingQuestion]:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        for d in range(1, 8):
            s.add(TrainingVideo(day_number=d, title=f"Day {d}"))
            if days_done:
                s.add(TrainingProgress(user_id=TEAM_ID, day_number=d, completed=True,
                                       completed_at=datetime.now(timezone.utc)))
        qs = [
            TrainingQuestion(question=f"Q{i}", option_a="w", option_b="x", option_c="y", option_d="z",
                             correct_answer="abcd"[i % 4], sort_order=i)
            for i in range(4)
        ]
        s.add_all(qs)
        await s.commit()
        return qs


def _answers(qs, correct: bool) -> dict[str, str]:
    return {
        str(q.id): (q.correct_answer if correct else ("a" if q.correct_answer != "a" else "b"))
        for q in qs
    }


async def test_quiz_needs_all_training_days(engine, clean, team_client: AsyncClient):
    qs = await _seed_quiz(engine, days_done=False)
    r = await team_client.post("/api/v1/system/training-test/submit", json={"answers": _answers(qs, True)})
    assert r.status_code == 400, r.text


async def test_quiz_needs_every_question_answered(engine, clean, team_client: AsyncClient):
    qs = await _seed_quiz(engine, days_done=True)
    partial = {str(qs[0].id): qs[0].correct_answer}
    r = await team_client.post("/api/v1/system/training-test/submit", json={"answers": partial})
    assert r.status_code == 422, r.text


async def test_quiz_attempts_are_limited_per_day(engine, clean, team_client: AsyncClient):
    qs = await _seed_quiz(engine, days_done=True)
    for _ in range(3):
        r = await team_client.post("/api/v1/system/training-test/submit", json={"answers": _answers(qs, False)})
        assert r.status_code == 200, r.text
        assert r.json()["passed"] is False
    r = await team_client.post("/api/v1/system/training-test/submit", json={"answers": _answers(qs, True)})
    assert r.status_code == 429, r.text


async def test_member_questions_hide_answers(engine, clean, team_client: AsyncClient):
    await _seed_quiz(engine, days_done=True)
    r = await team_client.get("/api/v1/system/training-test/questions")
    assert r.status_code == 200
    assert all("correct_answer" not in q for q in r.json())


async def test_admin_question_bank_crud(engine, clean, admin_client: AsyncClient):
    body = {"question": "Which day covers closing?", "option_a": "1", "option_b": "2",
            "option_c": "3", "option_d": "7", "correct_answer": "D", "sort_order": 1}
    created = await admin_client.post("/api/v1/admin/training/questions", json=body)
    assert created.status_code == 200, created.text
    qid = created.json()["id"]
    assert created.json()["correct_answer"] == "d"

    listed = await admin_client.get("/api/v1/admin/training/questions")
    assert [q["id"] for q in listed.json()["items"]] == [qid]

    updated = await admin_client.put(f"/api/v1/admin/training/questions/{qid}", json={**body, "correct_answer": "b"})
    assert updated.json()["correct_answer"] == "b"

    bad = await admin_client.post("/api/v1/admin/training/questions", json={**body, "correct_answer": "e"})
    assert bad.status_code == 422

    deleted = await admin_client.delete(f"/api/v1/admin/training/questions/{qid}")
    assert deleted.status_code == 200
    assert (await admin_client.get("/api/v1/admin/training/questions")).json()["items"] == []


async def test_question_bank_is_admin_only(engine, clean, team_client: AsyncClient):
    assert (await team_client.get("/api/v1/admin/training/questions")).status_code == 403


async def test_certificate_after_failed_then_passed_attempt(engine, clean, team_client: AsyncClient):
    """Several attempts (and no username) used to crash the download with a 500."""
    await _seed_quiz(engine, days_done=True)
    now = datetime.now(timezone.utc)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(TrainingTestAttempt(user_id=TEAM_ID, score=1, total_questions=4, passed=False,
                                  attempted_at=now - timedelta(hours=2)))
        s.add(TrainingTestAttempt(user_id=TEAM_ID, score=4, total_questions=4, passed=True,
                                  attempted_at=now - timedelta(hours=1)))
        u = await s.get(User, TEAM_ID)
        u.training_status = "completed"
        await s.commit()

    status = await team_client.get("/api/v1/training/certificate/status")
    assert status.status_code == 200, status.text
    assert status.json()["eligible"] is True

    r = await team_client.get("/api/v1/training/certificate")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "Rahul_Sharma" in r.headers["content-disposition"]


def test_certificate_name_prefers_real_name():
    from app.api.v1.certificate import certificate_display_name

    assert certificate_display_name(User(id=1, name="  priya   VERMA ", username="pv", fbo_id="F1")) == "priya VERMA"
    assert certificate_display_name(User(id=1, name="AMIT KUMAR", fbo_id="F1")) == "Amit Kumar"
    assert certificate_display_name(User(id=1, name="राहुल", username="rahul_k", fbo_id="F1")) == "rahul_k"
    assert certificate_display_name(User(id=7, name=None, username=None, fbo_id=None)) == "Member 7"


async def test_admin_redownloads_member_certificate(engine, clean, admin_client: AsyncClient):
    """Admin gets the member's own certificate (same number/date) from Training progress."""
    await _seed_quiz(engine, days_done=True)
    # not earned yet → nothing to download
    assert (await admin_client.get(f"/api/v1/admin/training/{TEAM_ID}/certificate")).status_code == 403

    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(TrainingTestAttempt(user_id=TEAM_ID, score=4, total_questions=4, passed=True,
                                  attempted_at=datetime.now(timezone.utc) - timedelta(days=3)))
        u = await s.get(User, TEAM_ID)
        u.training_status = "completed"
        await s.commit()

    progress = await admin_client.get("/api/v1/admin/training/progress")
    assert progress.status_code == 200, progress.text
    member = next(
        m for g in progress.json()["groups"] for m in g["members"] if m["user_id"] == TEAM_ID
    )
    assert member["certificate_ready"] is True

    r = await admin_client.get(f"/api/v1/admin/training/{TEAM_ID}/certificate")
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"%PDF")
    assert "Rahul_Sharma" in r.headers["content-disposition"]
    assert (await admin_client.get("/api/v1/admin/training/999999/certificate")).status_code == 404


async def test_member_certificate_redownload_is_admin_only(engine, clean, team_client: AsyncClient):
    assert (await team_client.get(f"/api/v1/admin/training/{TEAM_ID}/certificate")).status_code == 403
