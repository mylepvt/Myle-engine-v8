"""Web push: subscriptions persist and the stored VAPID PEM can actually sign."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.push_service import _generate_vapid_keys, _vapid_signer

USER = 7601


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add(User(id=USER, fbo_id="F07601", email="p@t.myle", role="team", name="Pia"))
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: AuthUser(user_id=USER, role="team", email="p@t.myle")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session
    app.dependency_overrides = saved
    await engine.dispose()


async def test_subscribe_persists_row_with_created_at(ctx):
    client, Session = ctx
    body = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "p", "auth": "a"}}
    r = await client.post("/api/v1/notifications/subscribe", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["created"] is True

    # Re-subscribing the same device updates instead of duplicating.
    r = await client.post("/api/v1/notifications/subscribe", json=body)
    assert r.json()["created"] is False

    async with Session() as s:
        rows = (await s.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1
    assert rows[0].created_at is not None
    assert (await client.get("/api/v1/notifications/status")).json()["subscribed"] is True


def test_stored_pem_key_can_sign_vapid_jwt():
    private_pem, _public = _generate_vapid_keys()
    headers = _vapid_signer(private_pem).sign(
        {"aud": "https://fcm.googleapis.com", "sub": "mailto:admin@mylecommunity.com"}
    )
    assert headers["Authorization"].startswith("WebPush ")
