"""Day 1/2 batch links and the Day 2 test link open only for that lead (their own mobile),
stay on the phone that opened them, and expire 2 hours after they're generated."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.day2_test_session import Day2TestSession
from app.models.lead import Lead
from app.services.prospect_links import MAX_DEVICES

_PHONE_SEQ = iter(range(9130000000, 9130009999))
SLOT = "d1_morning"


@pytest.fixture
async def phones(anon_client):
    """Fresh browsers (own cookie jars) sharing the app + test DB overrides."""
    from main import app

    clients: list[AsyncClient] = []

    def make() -> AsyncClient:
        c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        clients.append(c)
        return c

    yield make
    for c in clients:
        await c.aclose()


async def _lead(admin_client: AsyncClient) -> tuple[int, str]:
    phone = str(next(_PHONE_SEQ))
    r = await admin_client.post("/api/v1/leads", json={"name": "Asha Prospect", "status": "new_lead", "phone": phone})
    assert r.status_code == 201, r.text
    return r.json()["id"], phone


async def _batch_token(admin_client: AsyncClient, engine, lead_id: int) -> str:
    async with AsyncSession(engine) as s:
        if await s.get(AppSetting, f"batch_{SLOT}_v1") is None:
            s.add(AppSetting(key=f"batch_{SLOT}_v1", value="https://youtu.be/dQw4w9WgXcQ"))
            await s.commit()
    r = await admin_client.post(f"/api/v1/leads/{lead_id}/batch-share-url", json={"slot": SLOT})
    assert r.status_code == 200, r.text
    return r.json()["watch_url_v1"].split("token=")[1]


async def _age(engine, model, token: str, hours: float) -> None:
    async with AsyncSession(engine) as s:
        await s.execute(
            update(model).where(model.token == token)
            .values(created_at=datetime.now(timezone.utc) - timedelta(hours=hours))
        )
        await s.commit()


def _payload(token: str) -> str:
    return f"/api/v1/watch/batch/{SLOT}/1/payload?token={token}"


async def test_batch_link_opens_only_with_the_leads_number_and_stays_on_that_phone(admin_client, engine, phones):
    lead_id, phone = await _lead(admin_client)
    token = await _batch_token(admin_client, engine, lead_id)
    prospect = phones()

    body = (await prospect.get(_payload(token))).json()
    assert body["verified"] is False and body["youtube_url"] is None  # video hidden until verified
    assert body["phone_hint"].endswith(phone[-3:])

    unlock = f"/api/v1/watch/batch/{SLOT}/unlock"
    r = await prospect.post(unlock, json={"token": token, "phone": "9000000001"})
    assert r.status_code == 403
    r = await prospect.post(unlock, json={"token": token, "phone": f"+91 {phone}"})
    assert r.status_code == 200, r.text
    body = (await prospect.get(_payload(token))).json()
    assert body["verified"] is True and body["youtube_url"]

    # A forwarded copy: someone else's phone can't mark it watched, even with the token.
    forwarded = phones()
    r = await forwarded.post("/api/v1/watch/batch/complete", json={"token": token, "slot": SLOT})
    assert r.status_code == 403
    # ...and once the allowed phones are used up, knowing the number doesn't help either.
    for _ in range(MAX_DEVICES - 1):
        assert (await phones().post(unlock, json={"token": token, "phone": phone})).status_code == 200
    r = await forwarded.post(unlock, json={"token": token, "phone": phone})
    assert r.status_code == 403 and "another phone" in r.json()["error"]["message"]

    r = await prospect.post("/api/v1/watch/batch/complete", json={"token": token, "slot": SLOT})
    assert r.status_code == 200, r.text
    async with AsyncSession(engine) as s:
        assert (await s.get(Lead, lead_id)).d1_morning is True


async def test_logged_in_staff_cannot_open_or_tick_a_prospect_link(admin_client, engine, phones):
    lead_id, phone = await _lead(admin_client)
    token = await _batch_token(admin_client, engine, lead_id)
    staff = phones()
    staff.cookies.set(MYLE_ACCESS_COOKIE, "x")
    assert (await staff.get(_payload(token))).status_code == 403
    r = await staff.post(f"/api/v1/watch/batch/{SLOT}/unlock", json={"token": token, "phone": phone})
    assert r.status_code == 403


async def test_batch_link_expires_two_hours_after_it_is_made(admin_client, engine, phones):
    lead_id, phone = await _lead(admin_client)
    token = await _batch_token(admin_client, engine, lead_id)
    prospect = phones()
    assert (await prospect.post(f"/api/v1/watch/batch/{SLOT}/unlock",
                                json={"token": token, "phone": phone})).status_code == 200
    await _age(engine, BatchShareLink, token, hours=2.5)

    # Not opened in time → gone for everyone new.
    late = phones()
    assert (await late.get(_payload(token))).status_code == 410
    r = await late.post(f"/api/v1/watch/batch/{SLOT}/unlock", json={"token": token, "phone": phone})
    assert r.status_code == 410
    # The prospect who opened it in time can still finish watching.
    assert (await prospect.get(_payload(token))).json()["verified"] is True
    await _age(engine, BatchShareLink, token, hours=4.5)
    assert (await prospect.get(_payload(token))).status_code == 410

    # Sharing again gives a brand-new link.
    assert await _batch_token(admin_client, engine, lead_id) != token


async def _test_token(admin_client: AsyncClient, lead_id: int) -> str:
    r = await admin_client.post(f"/api/v1/leads/{lead_id}/day2-test-link")
    assert r.status_code == 200, r.text
    return r.json()["token"]


async def test_day2_test_needs_the_leads_number_and_stays_on_that_phone(admin_client, phones):
    lead_id, phone = await _lead(admin_client)
    token = await _test_token(admin_client, lead_id)
    prospect = phones()

    r = await prospect.post(f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": "9000000002"})
    assert r.status_code == 403  # someone else's number can't take the lead's test
    r = await prospect.post(f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": phone})
    assert r.status_code == 200, r.text

    forwarded = phones()
    assert (await forwarded.get(f"/api/test/d2/{token}")).status_code == 403
    r = await forwarded.post(f"/api/test/d2/{token}/answer", json={"question_index": 0, "choice_index": 0})
    assert r.status_code == 403
    r = await prospect.post(f"/api/test/d2/{token}/answer", json={"question_index": 0, "choice_index": 0})
    assert r.status_code == 200, r.text


async def test_unopened_day2_link_expires_after_two_hours_without_using_the_attempt(admin_client, engine, phones):
    lead_id, phone = await _lead(admin_client)
    token = await _test_token(admin_client, lead_id)
    await _age(engine, Day2TestSession, token, hours=2.5)

    prospect = phones()
    assert (await prospect.get(f"/api/test/d2/{token}")).status_code == 410
    r = await prospect.post(f"/api/test/d2/{token}/start", json={"name": "Ravi Kumar", "phone": phone})
    assert r.status_code == 410

    fresh = await _test_token(admin_client, lead_id)
    assert fresh != token
    r = await prospect.post(f"/api/test/d2/{fresh}/start", json={"name": "Ravi Kumar", "phone": phone})
    assert r.status_code == 200, r.text
    async with AsyncSession(engine) as s:
        assert (await s.get(Lead, lead_id)).day2_test_attempts == 1
        old = (await s.execute(select(Day2TestSession).where(Day2TestSession.token == token))).scalar_one()
        assert old.status == "expired"
