"""Day 2 → Day 3 gate mirrors old-app ACTION_MAP 'day2_complete':
both all Day-2 batches done AND the business test passed.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead

_PHONE = iter(range(9170000000, 9170009999))


async def _lead_at_day2(admin_client: AsyncClient) -> int:
    resp = await admin_client.post(
        "/api/v1/leads", json={"name": "D2", "status": "new_lead", "phone": str(next(_PHONE))}
    )
    lead_id = resp.json()["id"]
    for s in ("contacted", "invited", "video_sent", "video_watched", "day1", "day2"):
        assert (await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": s})).status_code == 200
    return lead_id


@pytest.mark.asyncio
async def test_day3_blocked_until_batches_and_test(admin_client: AsyncClient, engine):
    lead_id = await _lead_at_day2(admin_client)

    # nothing done → blocked (batches first)
    r1 = await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})
    assert r1.status_code == 400 and "batch" in r1.json()["error"]["message"].lower()

    # test passed but batches NOT done → still blocked on batches
    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        lead.day2_test_status = "passed"
        await s.commit()
    r2 = await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})
    assert r2.status_code == 400 and "batch" in r2.json()["error"]["message"].lower()

    # batches done but test reset to pending → blocked on test
    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        lead.d2_morning = lead.d2_afternoon = lead.d2_evening = True
        lead.day2_test_status = "pending"
        await s.commit()
    r3 = await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})
    assert r3.status_code == 400 and "test" in r3.json()["error"]["message"].lower()

    # both satisfied → allowed
    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        lead.day2_test_status = "passed"
        await s.commit()
    r4 = await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})
    assert r4.status_code == 200, r4.text
    assert r4.json()["status"] == "day3"
