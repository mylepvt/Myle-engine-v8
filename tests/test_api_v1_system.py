from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_question import TrainingQuestion
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.training_video import TrainingVideo
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_system_training_requires_auth() -> None:
    assert client.get("/api/v1/system/training").status_code == 401


def test_system_training_admin_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    r = c.get("/api/v1/system/training")
    assert r.status_code == 200
    body = r.json()
    assert body["videos"] == []
    assert body["progress"] == []
    assert body.get("note")


def test_system_training_ok_for_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/system/training")
    assert r.status_code == 200
    assert r.json()["videos"] == []
    assert r.json()["progress"] == []


def test_system_decision_engine_admin_only(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/system/decision-engine").status_code == 403
    c2 = _authed(monkeypatch)
    assert c2.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c2.get("/api/v1/system/decision-engine").status_code == 200


def test_system_coaching_admin_and_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/system/coaching").status_code == 403

    c2 = _authed(monkeypatch)
    assert c2.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c2.get("/api/v1/system/coaching").status_code == 200

    c3 = _authed(monkeypatch)
    assert c3.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c3.get("/api/v1/system/coaching").status_code == 200


async def _clear_training_tables() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(TrainingDayNote))
        await session.execute(delete(TrainingProgress))
        await session.execute(delete(TrainingTestAttempt))
        await session.execute(delete(TrainingQuestion))
        await session.execute(delete(TrainingVideo))
        await session.commit()


async def _seed_one_training_question() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            TrainingQuestion(
                question="Pick B",
                option_a="A",
                option_b="B",
                option_c="C",
                option_d="D",
                correct_answer="b",
                sort_order=1,
            )
        )
        await session.commit()


async def _seed_training_day(day_number: int = 1) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            TrainingVideo(
                day_number=day_number,
                title=f"Day {day_number}",
                youtube_url=f"https://youtu.be/day-{day_number}",
            )
        )
        await session.commit()


async def _seed_training_progress(
    user_id: int,
    day_number: int,
    *,
    completed_at: datetime | None = None,
) -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        session.add(
            TrainingProgress(
                user_id=user_id,
                day_number=day_number,
                completed=True,
                completed_at=completed_at or datetime.now(UTC),
            )
        )
        await session.commit()


def test_training_test_questions_and_submit(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_one_training_question())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        qs = c.get("/api/v1/system/training-test/questions").json()
        assert len(qs) == 1
        assert "a" in qs[0]["options"]
        qid = qs[0]["id"]
        sub = c.post(
            "/api/v1/system/training-test/submit",
            json={"answers": {str(qid): "b"}},
        )
        assert sub.status_code == 200
        body = sub.json()
        assert body["score"] == 1
        assert body["passed"] is True
        assert body["percent"] == 100
        assert body.get("training_completed") is True
    finally:
        asyncio.run(_clear_training_tables())


def test_training_test_submit_errors_when_empty_bank(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        assert c.get("/api/v1/system/training-test/questions").json() == []
        r = c.post("/api/v1/system/training-test/submit", json={"answers": {}})
        assert r.status_code == 400
    finally:
        asyncio.run(_clear_training_tables())


def test_system_training_notes_upload_route(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.post(
            "/api/v1/system/training/days/1/notes",
            files={"file": ("notes.png", b"fake-image", "image/png")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["day_number"] == 1
        assert body["image_url"].endswith(".png")

        training = c.get("/api/v1/system/training")
        assert training.status_code == 200
        assert training.json()["notes"] == [{"day_number": 1}]
    finally:
        asyncio.run(_clear_training_tables())


def test_system_training_notes_upload_rejects_locked_day(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day(1))
    asyncio.run(_seed_training_day(2))
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.post(
            "/api/v1/system/training/days/2/notes",
            files={"file": ("notes.png", b"fake-image", "image/png")},
        )
        assert res.status_code == 400
        assert res.json()["error"]["message"] == "Complete Day 1 first"
    finally:
        asyncio.run(_clear_training_tables())


def test_system_training_notes_upload_rejects_non_image(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.post(
            "/api/v1/system/training/days/1/notes",
            files={"file": ("notes.txt", b"not-an-image", "text/plain")},
        )
        assert res.status_code == 400
        assert "Unsupported image file" in res.json()["error"]["message"]
    finally:
        asyncio.run(_clear_training_tables())


def test_admin_training_audio_upload_preserves_m4a_extension(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.post(
            "/api/v1/admin/training/day/1/audio",
            files={"file": ("lesson.m4a", b"fake-audio", "audio/mp4")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["audio_url"].endswith(".m4a")

        training = c.get("/api/v1/system/training")
        assert training.status_code == 200
        assert training.json()["videos"][0]["audio_url"].endswith(".m4a")
    finally:
        asyncio.run(_clear_training_tables())


def test_admin_training_audio_reupload_busts_stale_url(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        first = c.post(
            "/api/v1/admin/training/day/1/audio",
            files={"file": ("lesson.m4a", b"fake-audio-1", "audio/mp4")},
        )
        assert first.status_code == 200
        second = c.post(
            "/api/v1/admin/training/day/1/audio",
            files={"file": ("lesson.m4a", b"fake-audio-2", "audio/mp4")},
        )
        assert second.status_code == 200
        assert first.json()["audio_url"] != second.json()["audio_url"]
        assert second.json()["audio_url"].endswith(".m4a")
    finally:
        asyncio.run(_clear_training_tables())


def test_system_training_normalizes_legacy_audio_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    try:
        factory = test_conftest.get_test_session_factory()

        async def seed_audio_url() -> None:
            async with factory() as session:
                row = await session.get(TrainingVideo, 1)
                assert row is not None
                row.audio_url = "audio/day1_podcast.m4a"
                await session.commit()

        asyncio.run(seed_audio_url())

        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.get("/api/v1/system/training")
        assert res.status_code == 200
        assert res.json()["videos"][0]["audio_url"] == "/uploads/training/audio/day1_podcast.m4a"
    finally:
        asyncio.run(_clear_training_tables())


def test_system_training_respects_calendar_unlock_dates(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day(1))
    asyncio.run(_seed_training_day(2))
    try:
        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        me = c.get("/api/v1/auth/me")
        assert me.status_code == 200
        user_id = me.json()["user_id"]
        asyncio.run(_seed_training_progress(user_id, 1, completed_at=datetime.now(UTC)))
        res = c.get("/api/v1/system/training")
        assert res.status_code == 200
        body = res.json()
        assert body["videos"][0]["unlocked"] is True
        assert body["videos"][1]["unlocked"] is False
        assert body["unlock_dates"]["2"]
    finally:
        asyncio.run(_clear_training_tables())


def test_admin_can_clear_uploaded_training_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_training_tables())
    asyncio.run(_seed_training_day())
    backend_root = Path(__file__).resolve().parents[1] / "backend"
    audio_dir = backend_root / "uploads" / "training_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "day_1.m4a"
    audio_file.write_bytes(b"fake-audio")
    try:
        factory = test_conftest.get_test_session_factory()

        async def seed_audio_url() -> None:
            async with factory() as session:
                row = await session.get(TrainingVideo, 1)
                assert row is not None
                row.audio_url = "/uploads/training_audio/day_1.m4a"
                await session.commit()

        asyncio.run(seed_audio_url())

        c = _authed(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.put("/api/v1/admin/training/day/1", json={"audio_url": ""})
        assert res.status_code == 200
        assert res.json()["audio_url"] is None
        assert audio_file.exists() is False
    finally:
        audio_file.unlink(missing_ok=True)
        asyncio.run(_clear_training_tables())
