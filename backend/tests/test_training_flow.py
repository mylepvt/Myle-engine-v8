"""Full 7-day training flow: notes → mark day → next day opens → quiz → certificate → unlocked."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.v1.system as system_api
import app.services.training_surface as training_surface
from app.core.time_ist import IST
from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_question import TrainingQuestion
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.training_video import TrainingVideo
from app.models.user import User

UID = 201
TODAY = date(2026, 10, 7)


@pytest.fixture
async def setup(engine, monkeypatch):
    monkeypatch.setattr(system_api, "today_ist", lambda: TODAY)
    monkeypatch.setattr(training_surface, "today_ist", lambda: TODAY)

    async def wipe():
        async with AsyncSession(engine) as s:
            for m in (TrainingTestAttempt, TrainingProgress, TrainingDayNote, TrainingQuestion, TrainingVideo):
                await s.execute(delete(m))
            await s.commit()

    await wipe()
    async with AsyncSession(engine, expire_on_commit=False) as s:
        u = await s.get(User, UID)
        if u is None:
            u = User(id=UID, fbo_id="T00201", email="team201@test.myle", role="team")
            s.add(u)
        u.name = "Flow Member"
        u.training_required = True
        u.training_status = "pending"
        for d in range(1, 8):
            s.add(TrainingVideo(day_number=d, title=f"Day {d}"))
            s.add(TrainingDayNote(user_id=UID, day_number=d, image_url=f"/notes/{d}.png"))
        s.add(TrainingQuestion(question="Q", option_a="a", option_b="b", option_c="c", option_d="d",
                               correct_answer="c", sort_order=1))
        await s.commit()
    yield
    await wipe()


def _ist(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST).astimezone(timezone.utc)


async def _set_day1_done_at(engine, when: datetime) -> None:
    async with AsyncSession(engine) as s:
        row = (await s.execute(
            select(TrainingProgress).where(TrainingProgress.user_id == UID, TrainingProgress.day_number == 1)
        )).scalar_one()
        row.completed_at = when
        await s.commit()


async def _unlocked(client: AsyncClient) -> dict[int, bool]:
    body = (await client.get("/api/v1/system/training")).json()
    return {v["day_number"]: v["unlocked"] for v in body["videos"]}


async def test_day_shown_open_can_be_completed(engine, setup, team_client: AsyncClient):
    """Day 1 done at 9 PM yesterday (IST): Day 2 is open this morning and can be marked done."""
    assert (await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 1})).status_code == 200
    await _set_day1_done_at(engine, _ist(TODAY - timedelta(days=1), 21))

    shown = await _unlocked(team_client)
    assert shown[2] is True and shown[3] is False

    r = await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 2})
    assert r.status_code == 200, r.text

    r = await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 3})
    assert r.status_code == 400
    assert "opens on 08 Oct 2026" in r.text


async def test_late_night_day1_does_not_open_day2_the_same_day(engine, setup, team_client: AsyncClient):
    """Day 1 done at 2 AM IST today: Day 2 opens tomorrow, not this morning (was a UTC-date bug)."""
    assert (await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 1})).status_code == 200
    await _set_day1_done_at(engine, _ist(TODAY, 2))

    assert (await _unlocked(team_client))[2] is False
    r = await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 2})
    assert r.status_code == 400


async def test_full_flow_to_certificate_and_unlock(engine, setup, team_client: AsyncClient):
    assert (await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 1})).status_code == 200
    await _set_day1_done_at(engine, _ist(TODAY - timedelta(days=6), 10))
    # Re-marking Day 1 must not move its date (later days are scheduled from it)
    assert (await team_client.post("/api/v1/system/training/mark-day", json={"day_number": 1})).status_code == 200

    for day in range(2, 8):
        r = await team_client.post("/api/v1/system/training/mark-day", json={"day_number": day})
        assert r.status_code == 200, (day, r.text)

    async with AsyncSession(engine) as s:
        assert (await s.get(User, UID)).training_status == "all_days_done"

    qs = (await team_client.get("/api/v1/system/training-test/questions")).json()
    r = await team_client.post("/api/v1/system/training-test/submit", json={"answers": {str(qs[0]["id"]): "c"}})
    assert r.status_code == 200, r.text
    assert r.json()["passed"] is True and r.json()["training_completed"] is True

    async with AsyncSession(engine) as s:
        u = await s.get(User, UID)
        await s.refresh(u)
        assert u.training_status == "completed"
        assert u.training_required is False  # dashboard lock lifts (training_required && !completed)

    cert = await team_client.get("/api/v1/training/certificate")
    assert cert.status_code == 200
    assert cert.content.startswith(b"%PDF")
