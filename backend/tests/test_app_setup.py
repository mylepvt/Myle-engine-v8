"""App setup per member: installed vs browser, notifications on / blocked / off."""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.db.base import Base
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.app_setup import build_app_setup, record_device_status

READY, BROWSER, BLOCKED, NEVER = 9501, 9502, 9503, 9504


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add_all([
            User(id=READY, fbo_id="r", email="r@t", role="team", name="Ready Rita"),
            User(id=BROWSER, fbo_id="b", email="b@t", role="team", name="Browser Bob"),
            User(id=BLOCKED, fbo_id="x", email="x@t", role="leader", name="Blocked Ben"),
            User(id=NEVER, fbo_id="n", email="n@t", role="team", name="Never Nia"),
            User(id=9599, fbo_id="adm", email="a@t", role="admin", name="Admin"),
        ])
        s.add(PushSubscription(user_id=READY, endpoint="https://push/1", keys_p256dh="k", keys_auth="a"))
        await s.commit()
    yield S
    await engine.dispose()


async def test_app_setup_classifies_every_member(Session):
    async with Session() as s:
        await record_device_status(s, user_id=READY, platform="android", standalone=True, push_permission="granted")
        await record_device_status(s, user_id=BROWSER, platform="ios", standalone=False, push_permission="default")
        await record_device_status(s, user_id=BLOCKED, platform="android", standalone=True, push_permission="denied")
        await record_device_status(s, user_id=BLOCKED, platform="android", standalone=True, push_permission="denied")  # upsert
        out = await build_app_setup(s)
    rows = {m["user_id"]: (m["app"], m["notifications"], m["ready"]) for m in out["members"]}
    assert rows == {
        READY: ("installed", "on", True),
        BROWSER: ("browser", "off", False),
        BLOCKED: ("installed", "blocked", False),
        NEVER: ("unknown", "off", False),
    }
    assert (out["total"], out["ready"], out["installed"], out["notifications_on"]) == (4, 1, 2, 1)
    assert out["members"][-1]["user_id"] == READY  # not-ready people first
