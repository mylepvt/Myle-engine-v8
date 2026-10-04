"""Admin "Delete permanently": identity erased, FBO/email/phone freed, work re-homed."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.lead import Lead
from app.models.push_subscription import PushSubscription
from app.models.user import User

ADMIN, LEADER, MEMBER, CHILD = 7700, 7701, 7702, 7703


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="f07700", email="a@t.myle", role="admin", name="Admin"),
            User(id=LEADER, fbo_id="f07701", email="l@t.myle", role="leader", name="Lina", upline_user_id=ADMIN),
            User(id=MEMBER, fbo_id="f07702", email="m@t.myle", role="team", name="Mohit",
                 phone="9000000001", hashed_password="x", upline_user_id=LEADER),
            User(id=CHILD, fbo_id="f07703", email="c@t.myle", role="team", name="Chetan", upline_user_id=MEMBER),
        ])
        await s.flush()
        s.add(Lead(name="Working lead", status="contacted", created_by_user_id=MEMBER,
                   owner_user_id=MEMBER, assigned_to_user_id=MEMBER, outcome="active"))
        s.add(PushSubscription(user_id=MEMBER, endpoint="https://push/x", keys_p256dh="p", keys_auth="a"))
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    who = {"user": AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session, who
    app.dependency_overrides = saved
    await engine.dispose()


async def test_purge_erases_identity_and_rehomes_work(ctx):
    client, Session, _who = ctx
    r = await client.post(f"/api/v1/team/members/{MEMBER}/purge")
    assert r.status_code == 200, r.text
    assert r.json() == {"leads_moved": 1, "leads_moved_to_user_id": LEADER, "downline_moved": 1}

    async with Session() as s:
        m = await s.get(User, MEMBER)
        assert m.fbo_id == f"deleted-{MEMBER}"
        assert m.name == f"Deleted member #{MEMBER}"
        assert (m.phone, m.hashed_password, m.username) == (None, None, None)
        assert m.access_blocked is True and m.removed_at is not None
        lead = (await s.execute(select(Lead))).scalar_one()
        assert lead.assigned_to_user_id == LEADER
        assert lead.owner_user_id == MEMBER  # ownership is immutable
        assert (await s.get(User, CHILD)).upline_user_id == LEADER
        assert (await s.execute(select(PushSubscription))).scalars().all() == []

    # Gone from the admin list…
    ids = [m["id"] for m in (await client.get("/api/v1/team/members")).json()["items"]]
    assert MEMBER not in ids
    # …and the FBO ID / email / phone can be registered again.
    r = await client.post(
        "/api/v1/team/members",
        json={"fbo_id": "f07702", "email": "m@t.myle", "phone": "9000000001",
              "password": "Passw0rd!x", "role": "team", "name": "Mohit again"},
    )
    assert r.status_code == 201, r.text


async def test_purge_guards(ctx):
    client, _Session, who = ctx
    assert (await client.post(f"/api/v1/team/members/{ADMIN}/purge")).status_code == 400
    who["user"] = AuthUser(user_id=LEADER, role="leader", email="l@t.myle")
    assert (await client.post(f"/api/v1/team/members/{MEMBER}/purge")).status_code == 403
