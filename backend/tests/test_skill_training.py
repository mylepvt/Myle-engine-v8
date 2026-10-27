"""Personal Development & Skills Academy — unlock gate, teaser, lessons, permissions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill_training import SkillLesson, SkillLessonProgress
from app.models.training_progress import TrainingProgress
from app.models.training_video import TrainingVideo
from app.models.user import User
from app.services.skill_training import CATEGORY_KEYS, youtube_embed_url

BASE = "/api/v1/system/skills-training"
TEAM, LEADER, ADMIN = 201, 202, 203


async def _reset(engine, *, status: str, required: bool, uid: int = TEAM, done_days: int = 0) -> None:
    """Fresh catalog + users. ``uid`` gets the onboarding state; ``done_days`` days ticked."""
    async with AsyncSession(engine, expire_on_commit=False) as s:
        for model in (SkillLessonProgress, SkillLesson, TrainingProgress, TrainingVideo):
            await s.execute(delete(model))
        for user_id, role in ((TEAM, "team"), (LEADER, "leader"), (ADMIN, "admin")):
            row = await s.get(User, user_id)
            if row is None:
                row = User(id=user_id, fbo_id=f"T{user_id:05d}", email=f"{role}{user_id}@test.myle", name=f"{role} {user_id}")
                s.add(row)
            row.role = role
            row.registration_status = "approved"
            row.training_status = "completed"
            row.training_required = False
        (await s.get(User, TEAM)).upline_user_id = LEADER
        target = await s.get(User, uid)
        target.training_status = status
        target.training_required = required

        for day in range(1, 8):
            s.add(TrainingVideo(day_number=day, title=f"Onboarding {day}", youtube_url=f"https://youtu.be/on{day}"))
        start = datetime.now(timezone.utc) - timedelta(days=10)
        for day in range(1, done_days + 1):
            s.add(TrainingProgress(user_id=uid, day_number=day, completed=True, completed_at=start + timedelta(days=day - 1)))

        s.add_all(
            [
                SkillLesson(category="invitation", position=2, title="Create curiosity", youtube_url="https://youtu.be/inv2"),
                SkillLesson(category="invitation", position=1, title="Who to invite", youtube_url="https://youtu.be/inv1"),
                SkillLesson(
                    category="closing",
                    position=1,
                    title="Recognising readiness",
                    youtube_url="https://youtu.be/close1",
                    practice_task="Write how you would ask a prospect if they are ready.",
                    practice_required=True,
                ),
                SkillLesson(category="process", position=1, title="Lead to closing", youtube_url="https://youtu.be/proc1"),
                SkillLesson(category="mistakes", position=1, title="Incorrect claims"),  # no recording yet
            ]
        )
        await s.commit()


async def _lesson_id(engine, title: str) -> int:
    async with AsyncSession(engine) as s:
        rows = (await s.execute(SkillLesson.__table__.select().where(SkillLesson.title == title))).all()
        return int(rows[0].id)


def _lessons(body: dict) -> list[dict]:
    return [l for c in body["categories"] for l in c["lessons"]]


# ── Unlock gate (acceptance criteria) ─────────────────────────────────────────


async def test_new_user_onboarding_open_skills_locked(engine, team_client: AsyncClient):
    await _reset(engine, status="pending", required=True)
    body = (await team_client.get(BASE)).json()
    assert body["available"] is False
    assert body["onboarding"]["status"] == "not_started"
    assert body["onboarding"]["completed_days"] == 0
    assert body["onboarding"]["current_day"] == 1
    assert body["onboarding"]["teaser"] is False
    # Locked preview: the outline in the fixed order, but no lesson content.
    assert [c["key"] for c in body["categories"]] == list(CATEGORY_KEYS)
    assert [c["number"] for c in body["categories"]] == [1, 2, 3, 4, 5, 6]
    assert body["categories"][1]["total_lessons"] == 2
    assert _lessons(body) == []


async def test_day_three_stays_locked_without_teaser(engine, team_client: AsyncClient):
    await _reset(engine, status="pending", required=True, done_days=2)
    body = (await team_client.get(BASE)).json()
    assert body["available"] is False
    assert body["onboarding"]["status"] == "in_progress"
    assert body["onboarding"]["current_day"] == 3
    assert body["onboarding"]["teaser"] is False


async def test_day_seven_shows_teaser_but_does_not_unlock(engine, team_client: AsyncClient):
    await _reset(engine, status="pending", required=True, done_days=6)
    body = (await team_client.get(BASE)).json()
    assert body["onboarding"]["current_day"] == 7
    assert body["onboarding"]["teaser"] is True
    assert body["available"] is False

    lesson = await _lesson_id(engine, "Who to invite")
    r = await team_client.post(f"{BASE}/lessons/{lesson}/complete")
    assert r.status_code == 400
    assert (await team_client.get(f"{BASE}/lessons/{lesson}/embed", follow_redirects=False)).status_code == 404


async def test_all_days_ticked_but_test_pending_stays_locked(engine, team_client: AsyncClient):
    await _reset(engine, status="all_days_done", required=True, done_days=7)
    body = (await team_client.get(BASE)).json()
    assert body["available"] is False
    assert body["onboarding"]["awaiting_certification"] is True
    lesson = await _lesson_id(engine, "Who to invite")
    assert (await team_client.post(f"{BASE}/lessons/{lesson}/complete")).status_code == 400


async def _same_rule(engine, client: AsyncClient, uid: int) -> None:
    await _reset(engine, status="pending", required=True, uid=uid, done_days=6)
    body = (await client.get(BASE)).json()
    assert body["available"] is False, "the leader role must not bypass onboarding"
    lesson = await _lesson_id(engine, "Who to invite")
    assert (await client.post(f"{BASE}/lessons/{lesson}/complete")).status_code == 400

    await _reset(engine, status="completed", required=False, uid=uid, done_days=7)
    body = (await client.get(BASE)).json()
    assert body["available"] is True
    assert body["onboarding"]["status"] == "completed"
    assert body["onboarding"]["teaser"] is False
    assert (await client.post(f"{BASE}/lessons/{lesson}/complete")).status_code == 200


async def test_same_rule_for_team_member(engine, team_client: AsyncClient):
    await _same_rule(engine, team_client, TEAM)


async def test_same_rule_for_leader(engine, leader_client: AsyncClient):
    await _same_rule(engine, leader_client, LEADER)


# ── Lessons ───────────────────────────────────────────────────────────────────


async def test_unlocked_academy_lists_lessons_in_category_order(engine, team_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    body = (await team_client.get(BASE)).json()
    assert body["status"] == "not_started"
    assert body["total_lessons"] == 5
    invitation = body["categories"][1]
    assert [l["title"] for l in invitation["lessons"]] == ["Who to invite", "Create curiosity"]
    assert [l["number"] for l in invitation["lessons"]] == [1, 2]
    assert all(l["youtube_url"] is None for l in _lessons(body))  # links stay server-side
    # Next recommended lesson: first one with a recording, in category order.
    assert body["next_lesson_id"] == await _lesson_id(engine, "Lead to closing")


async def test_complete_lesson_persists_and_advances(engine, team_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    first = await _lesson_id(engine, "Lead to closing")
    r = await team_client.post(f"{BASE}/lessons/{first}/complete")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["completed_lessons"] == 1
    assert body["status"] == "in_progress"
    assert body["categories"][0]["status"] == "completed"
    assert body["next_lesson_id"] == await _lesson_id(engine, "Who to invite")

    # Logout / login: progress is server-side, a fresh request still sees it.
    again = (await team_client.get(BASE)).json()
    assert again["completed_lessons"] == 1
    # Idempotent.
    assert (await team_client.post(f"{BASE}/lessons/{first}/complete")).json()["completed_lessons"] == 1

    embed = await team_client.get(f"{BASE}/lessons/{first}/embed", follow_redirects=False)
    assert embed.status_code == 302
    assert embed.headers["location"].startswith("https://www.youtube.com/embed/proc1")


async def test_lesson_without_recording_cannot_be_completed(engine, team_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    lesson = await _lesson_id(engine, "Incorrect claims")
    r = await team_client.post(f"{BASE}/lessons/{lesson}/complete")
    assert r.status_code == 400
    assert (await team_client.post(f"{BASE}/lessons/99999/complete")).status_code == 404


async def test_practice_required_lesson_needs_an_answer(engine, team_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    lesson = await _lesson_id(engine, "Recognising readiness")
    assert (await team_client.post(f"{BASE}/lessons/{lesson}/complete")).status_code == 400
    r = await team_client.post(f"{BASE}/lessons/{lesson}/complete", json={"practice_response": "too short"})
    assert r.status_code == 400

    answer = "I would ask: what would help you feel confident to decide today?"
    r = await team_client.post(f"{BASE}/lessons/{lesson}/complete", json={"practice_response": answer})
    assert r.status_code == 200, r.text
    done = next(l for l in _lessons(r.json()) if l["id"] == lesson)
    assert done["completed"] is True
    assert done["practice_response"] == answer


# ── Permissions ───────────────────────────────────────────────────────────────


async def test_team_cannot_see_progress_or_manage_lessons(engine, team_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    lesson = await _lesson_id(engine, "Who to invite")
    assert (await team_client.get(f"{BASE}/progress")).status_code == 403
    assert (await team_client.post(f"{BASE}/admin/lessons", json={"category": "process", "title": "x"})).status_code == 403
    assert (await team_client.put(f"{BASE}/admin/lessons/{lesson}", json={"title": "x"})).status_code == 403
    assert (await team_client.delete(f"{BASE}/admin/lessons/{lesson}")).status_code == 403


async def test_leader_sees_downline_progress(engine, leader_client):
    await _reset(engine, status="completed", required=False, done_days=7)
    lesson = await _lesson_id(engine, "Recognising readiness")
    async with AsyncSession(engine) as s:
        s.add(SkillLessonProgress(user_id=TEAM, lesson_id=lesson, practice_response="x" * 30, completed_at=datetime.now(timezone.utc)))
        await s.commit()

    overview = (await leader_client.get(f"{BASE}/progress")).json()
    assert [c["key"] for c in overview["categories"]] == list(CATEGORY_KEYS)
    member = next(m for m in overview["members"] if m["user_id"] == TEAM)
    assert member["completed_lessons"] == 1
    assert member["practice_submitted"] == 1
    assert member["by_category"]["closing"] == 1
    assert all(m["user_id"] != ADMIN for m in overview["members"])


async def test_admin_manages_lessons(engine, admin_client: AsyncClient):
    await _reset(engine, status="completed", required=False, done_days=7)
    r = await admin_client.post(
        f"{BASE}/admin/lessons",
        json={"category": "invitation", "title": "Confirming the meeting", "duration_minutes": 8},
    )
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["position"] == 3

    r = await admin_client.put(
        f"{BASE}/admin/lessons/{created['id']}",
        json={"youtube_url": "https://youtu.be/inv3", "practice_task": "Write your invite.", "practice_required": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["practice_required"] is True
    assert r.json()["duration_minutes"] == 8

    admin_view = (await admin_client.get(BASE)).json()
    assert admin_view["available"] is True
    assert admin_view["onboarding"]["teaser"] is False
    row = next(l for l in _lessons(admin_view) if l["id"] == created["id"])
    assert row["youtube_url"] == "https://youtu.be/inv3"

    assert (await admin_client.post(f"{BASE}/admin/lessons", json={"category": "nope", "title": "x"})).status_code == 400
    assert (await admin_client.post(f"{BASE}/admin/lessons", json={"category": "process"})).status_code == 400
    assert (await admin_client.delete(f"{BASE}/admin/lessons/{created['id']}")).status_code == 204
    assert (await admin_client.put(f"{BASE}/admin/lessons/{created['id']}", json={"title": "x"})).status_code == 404


def test_youtube_embed_url_normalises_links() -> None:
    for raw in ("https://youtu.be/abc?t=1", "https://www.youtube.com/watch?v=abc&x=1", "https://www.youtube.com/embed/abc"):
        assert youtube_embed_url(raw).startswith("https://www.youtube.com/embed/abc?")
