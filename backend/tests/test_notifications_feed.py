"""Tests for the in-app notification feed (the bell)."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.notification import Notification


@pytest_asyncio.fixture
async def seed_notifications(engine):
    """Seed three notifications for user 201 (team_client) and one for another user."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                Notification(user_id=201, title="Welcome", body="First", url="/dashboard", category="general"),
                Notification(user_id=201, title="Wallet topped up", body="₹500", url="/dashboard/wallet", category="wallet"),
                Notification(user_id=201, title="Report due", body="Submit today", url="/dashboard/reports", category="report"),
                # A different user's notification — must never leak into 201's feed.
                Notification(user_id=999, title="Not yours", body="hidden", url="/dashboard", category="general"),
            ]
        )
        await session.commit()
    yield
    # Clean up so other tests are unaffected.
    async with factory() as session:
        for uid in (201, 999):
            rows = (
                await session.execute(
                    Notification.__table__.delete().where(Notification.user_id == uid)
                )
            )
            _ = rows
        await session.commit()


@pytest.mark.asyncio
async def test_feed_returns_only_current_user(team_client, seed_notifications):
    res = await team_client.get("/api/v1/notifications/feed")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    assert data["unread"] == 3
    assert len(data["items"]) == 3
    titles = {item["title"] for item in data["items"]}
    assert "Not yours" not in titles
    # Newest first.
    assert data["items"][0]["title"] == "Report due"
    assert all(item["read"] is False for item in data["items"])


@pytest.mark.asyncio
async def test_unread_count(team_client, seed_notifications):
    res = await team_client.get("/api/v1/notifications/feed/unread-count")
    assert res.status_code == 200
    assert res.json()["unread"] == 3


@pytest.mark.asyncio
async def test_mark_one_read(team_client, seed_notifications):
    feed = (await team_client.get("/api/v1/notifications/feed")).json()
    target_id = feed["items"][0]["id"]

    res = await team_client.post(f"/api/v1/notifications/feed/{target_id}/read")
    assert res.status_code == 200
    assert res.json()["ok"] is True

    count = (await team_client.get("/api/v1/notifications/feed/unread-count")).json()
    assert count["unread"] == 2


@pytest.mark.asyncio
async def test_mark_all_read(team_client, seed_notifications):
    res = await team_client.post("/api/v1/notifications/feed/read-all")
    assert res.status_code == 200
    assert res.json()["updated"] >= 3

    count = (await team_client.get("/api/v1/notifications/feed/unread-count")).json()
    assert count["unread"] == 0


@pytest.mark.asyncio
async def test_mark_read_not_found(team_client, seed_notifications):
    res = await team_client.post("/api/v1/notifications/feed/99999999/read")
    assert res.status_code == 404
