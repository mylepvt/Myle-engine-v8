"""Post-unlock Skills & Personal Development training track."""

from __future__ import annotations

from datetime import date, datetime, timezone

from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill_training import SkillTrainingProgress, SkillTrainingVideo
from app.models.user import User
from app.services.skill_training import _day_states, youtube_embed_url

BASE = "/api/v1/system/skills-training"


async def _reset(engine, *, team_status: str, team_required: bool) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        await s.execute(delete(SkillTrainingProgress))
        await s.execute(delete(SkillTrainingVideo))
        for uid, role in ((201, "team"), (203, "admin")):
            row = await s.get(User, uid)
            if row is None:
                row = User(id=uid, fbo_id=f"T{uid:05d}", email=f"{role}{uid}@test.myle", role=role, name=f"{role} {uid}")
                s.add(row)
            row.role = role
            row.registration_status = "approved"
        team = await s.get(User, 201)
        team.training_status = team_status
        team.training_required = team_required
        await s.commit()


async def _seed_days(engine) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        for day in (1, 2):
            s.add(SkillTrainingVideo(day_number=day, title=f"Skill {day}", youtube_url=f"https://youtu.be/vid{day}"))
        await s.commit()


async def test_skills_training_locked_during_onboarding(engine, team_client):
    await _reset(engine, team_status="pending", team_required=True)
    await _seed_days(engine)

    body = (await team_client.get(BASE)).json()
    assert body["available"] is False
    assert all(not d["unlocked"] for d in body["days"])
    r = await team_client.post(f"{BASE}/days/1/done")
    assert r.status_code == 400


async def test_skills_training_one_day_per_calendar_day(engine, team_client):
    await _reset(engine, team_status="completed", team_required=False)
    await _seed_days(engine)

    body = (await team_client.get(BASE)).json()
    assert body["available"] is True
    assert [d["unlocked"] for d in body["days"]] == [True, False]
    assert body["days"][0]["youtube_url"] is None  # link stays server-side for members

    r = await team_client.post(f"{BASE}/days/1/done")
    assert r.status_code == 200, r.text
    after = r.json()
    assert after["completed_days"] == 1
    assert after["days"][1]["unlocked"] is False
    assert after["days"][1]["unlocks_on"] is not None

    r = await team_client.post(f"{BASE}/days/2/done")
    assert r.status_code == 400
    assert "opens on" in str(r.json())

    embed = await team_client.get(f"{BASE}/days/1/embed", follow_redirects=False)
    assert embed.status_code == 302
    assert embed.headers["location"].startswith("https://www.youtube.com/embed/vid1")
    assert (await team_client.get(f"{BASE}/days/2/embed", follow_redirects=False)).status_code == 404


async def test_skills_training_team_cannot_see_progress_or_edit(engine, team_client):
    await _reset(engine, team_status="completed", team_required=False)
    assert (await team_client.get(f"{BASE}/progress")).status_code == 403
    assert (await team_client.put(f"{BASE}/admin/day/1", json={"title": "x"})).status_code == 403


async def test_admin_progress_and_edit(engine, admin_client):
    await _reset(engine, team_status="not_required", team_required=False)
    await _seed_days(engine)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(SkillTrainingProgress(user_id=201, day_number=1, completed_at=datetime.now(timezone.utc)))
        await s.commit()

    overview = (await admin_client.get(f"{BASE}/progress")).json()
    assert overview["total_days"] == 2
    member = next(m for m in overview["members"] if m["user_id"] == 201)
    assert member["completed_days"] == 1

    r = await admin_client.put(f"{BASE}/admin/day/2", json={"title": "Time management", "youtube_url": "https://youtu.be/new"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Time management"
    admin_view = (await admin_client.get(BASE)).json()
    assert admin_view["days"][1]["youtube_url"] == "https://youtu.be/new"
    assert all(d["unlocked"] for d in admin_view["days"])
    assert (await admin_client.put(f"{BASE}/admin/day/8", json={"title": "x"})).status_code == 400


def test_next_day_opens_the_following_calendar_day() -> None:
    progress = SkillTrainingProgress(
        user_id=1, day_number=1, completed_at=datetime(2026, 9, 29, 6, 0, tzinfo=timezone.utc)
    )
    same_day = _day_states([1, 2], {1: progress}, date(2026, 9, 29))
    assert same_day[2] == (False, date(2026, 9, 30))
    next_day = _day_states([1, 2], {1: progress}, date(2026, 9, 30))
    assert next_day[2] == (True, None)


def test_youtube_embed_url_normalises_links() -> None:
    for raw in ("https://youtu.be/abc?t=1", "https://www.youtube.com/watch?v=abc&x=1", "https://www.youtube.com/embed/abc"):
        assert youtube_embed_url(raw).startswith("https://www.youtube.com/embed/abc?")
