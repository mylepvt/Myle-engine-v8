"""Team wins feed: wins are recorded from real events, cheers toggle, winner gets a push."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.db.base import Base
from app.models.lead import Lead
from app.models.process_reward import ProcessPoint
from app.models.user import User
from app.services import process_rewards as pr
from app.models.win import Win
from app.services import push_service
from app.services.wins import list_wins, record_win, toggle_cheer
from app.services.xp_service import grant_xp

A, B, GONE = 8101, 8102, 8103


@pytest.fixture
async def Session(monkeypatch):
    pushes: list[tuple[int, str]] = []

    async def fake_push(_s, user_id, *, title, body, url="/dashboard", **_kw):
        pushes.append((user_id, body))
        return 1

    monkeypatch.setattr(push_service, "send_push_to_user", fake_push)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add_all([
            User(id=A, fbo_id="f8101", email="a@t", role="team", name="Priya Sharma"),
            User(id=B, fbo_id="f8102", email="b@t", role="leader", name="Rahul"),
            User(id=GONE, fbo_id="f8103", email="g@t", role="team", name="Old",
                 removed_at=datetime.now(timezone.utc)),
        ])
        await s.commit()
    S.pushes = pushes
    yield S
    await engine.dispose()


async def test_feed_lists_todays_wins_without_removed_or_old(Session):
    async with Session() as s:
        record_win(s, user_id=A, kind="enrollment")
        record_win(s, user_id=A, kind="streak", detail="7")
        record_win(s, user_id=GONE, kind="conversion")
        s.add(Win(user_id=B, kind="conversion", created_at=datetime.now(timezone.utc) - timedelta(days=1)))
        record_win(s, user_id=A, kind="bogus")  # ignored
        await s.commit()
        items = await list_wins(s, viewer_id=B)
    texts = sorted(i["text"] for i in items)
    assert texts == ["Priya enrolled a new prospect", "Priya is on a 7-day streak"]
    assert all(i["cheers"] == 0 and not i["cheered_by_me"] and not i["is_mine"] for i in items)


async def test_cheer_toggles_and_pushes_winner_once(Session):
    async with Session() as s:
        record_win(s, user_id=A, kind="conversion")
        await s.commit()
        win_id = (await list_wins(s, viewer_id=B))[0]["id"]

        assert await toggle_cheer(s, win_id=win_id, user_id=B) == {"cheered": True, "cheers": 1}
        assert Session.pushes == [(A, "Rahul cheered your conversion.")]
        item = (await list_wins(s, viewer_id=B))[0]
        assert item["cheers"] == 1 and item["cheered_by_me"]

        assert await toggle_cheer(s, win_id=win_id, user_id=B) == {"cheered": False, "cheers": 0}
        # self-cheer counts but never pushes
        assert await toggle_cheer(s, win_id=win_id, user_id=A) == {"cheered": True, "cheers": 1}
        assert len(Session.pushes) == 1
        assert await toggle_cheer(s, win_id=999, user_id=B) is None


async def test_level_up_comes_from_myle_points_not_xp(Session):
    async with Session() as s:
        user = await s.get(User, A)
        user.xp_total, user.xp_level = 290, "agent"
        await grant_xp(s, A, "report_submitted")  # crosses an XP level: no win any more
        await s.commit()
        assert await list_wins(s, viewer_id=A) == []

        s.add(Lead(id=1, name="P", status="day1", created_by_user_id=A, owner_user_id=A,
                   assigned_to_user_id=A, in_pool=False, call_count=0))
        await s.flush()
        s.add(ProcessPoint(user_id=A, lead_id=1, step="converted", points=150))
        s.add(ProcessPoint(user_id=A, lead_id=1, step="stage_selected", points=50))
        s.add(ProcessPoint(user_id=A, lead_id=1, step="enrolled", points=50))
        await s.commit()
        assert await pr._record_level_ups(s, {A: 50}) == [(A, "Agent")]  # 200 → 250 MP
        assert await pr._record_level_ups(s, {A: 0}) == []
        items = await list_wins(s, viewer_id=A)
    assert [(i["kind"], i["text"], i["is_mine"]) for i in items] == [("level_up", "Priya reached Agent level", True)]
