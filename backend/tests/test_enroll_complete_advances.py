"""Enrollment-Live link watched → auto-advance video_sent → video_watched.

The prospect opens the single open token link, verifies their number (unlock), and
finishes the Day-1 video. Completing it crosses the team boundary automatically.
"""
from __future__ import annotations

import secrets

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flp_min_billing_share_link import FlpMinBillingShareLink
from app.models.lead import Lead

_PHONE = iter(range(9160000000, 9160009999))


@pytest.mark.asyncio
async def test_complete_advances_to_video_watched(admin_client: AsyncClient, anon_client: AsyncClient, engine):
    phone = str(next(_PHONE))
    created = await admin_client.post(
        "/api/v1/leads", json={"name": "Watcher", "status": "new_lead", "phone": phone}
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]
    assert (await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "video_sent"})).status_code == 200

    token = secrets.token_urlsafe(24)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(
            FlpMinBillingShareLink(
                token=token,
                lead_id=lead_id,
                created_by_user_id=203,
                youtube_url="https://example.com/day1.mp4",
                title="Day 1",
            )
        )
        await s.commit()

    # Prospect verifies their number (unlock → sets watch cookie + starts the timer).
    unlocked = await anon_client.post(
        f"/api/v1/watch/{token}/unlock", json={"name": "Watcher", "phone": phone}
    )
    assert unlocked.status_code == 200, unlocked.text

    # Finishing the video crosses the team boundary automatically.
    done = await anon_client.post(f"/api/v1/watch/{token}/complete")
    assert done.status_code == 200, done.text
    assert done.json()["watch_completed"] is True

    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        # Finishing the video auto-advances past video_watched straight to Day 1
        # so the handed-off lead lands on the leader's workboard Day 1.
        assert lead.status == "day1"


@pytest.mark.asyncio
async def test_complete_wrong_number_blocked(anon_client: AsyncClient, admin_client: AsyncClient, engine):
    phone = str(next(_PHONE))
    created = await admin_client.post(
        "/api/v1/leads", json={"name": "Watcher2", "status": "new_lead", "phone": phone}
    )
    lead_id = created.json()["id"]
    await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "video_sent"})

    token = secrets.token_urlsafe(24)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(
            FlpMinBillingShareLink(
                token=token, lead_id=lead_id, created_by_user_id=203,
                youtube_url="https://example.com/day1.mp4", title="Day 1",
            )
        )
        await s.commit()

    bad = await anon_client.post(
        f"/api/v1/watch/{token}/unlock", json={"name": "X", "phone": "9999999999"}
    )
    assert bad.status_code == 403
