"""Day 3 Stage picker + seat-hold — pricing, role gate, reserve window, expiry."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.stage_pricing import STAGE_PRICING
from app.models.lead import Lead
from app.services.leads_service import expire_stale_seat_holds

_PHONE = iter(range(9130000000, 9130009999))


async def _lead_at_day3(admin_client: AsyncClient) -> int:
    resp = await admin_client.post(
        "/api/v1/leads",
        json={"name": "Closer", "status": "new_lead", "phone": str(next(_PHONE))},
    )
    assert resp.status_code == 201, resp.text
    lead_id = resp.json()["id"]
    # admin jumps straight to day3 (prev != day2 → Day 2 test gate not triggered)
    r = await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})
    assert r.status_code == 200, r.text
    return lead_id


@pytest.mark.asyncio
async def test_stage_select_sets_price(admin_client: AsyncClient):
    lead_id = await _lead_at_day3(admin_client)
    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage2"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stage_selected"] == "stage2"
    assert body["stage_price_cents"] == STAGE_PRICING["stage2"]["price_cents"]
    assert body["seat_hold_amount_cents"] == STAGE_PRICING["stage2"]["seat_hold_cents"]
    # stage-selection checklist task auto-marked done
    assert body["process_tracking"]["day3"]["day3_stage_selection"] is True


@pytest.mark.asyncio
async def test_invalid_stage_rejected(admin_client: AsyncClient):
    lead_id = await _lead_at_day3(admin_client)
    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage9"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_team_cannot_select_stage(team_client: AsyncClient):
    # Stage select is leader/admin-only — the role gate 403s regardless of stage status.
    resp = await team_client.post(
        "/api/v1/leads",
        json={"name": "Closer", "status": "new_lead", "phone": str(next(_PHONE))},
    )
    assert resp.status_code == 201, resp.text
    lead_id = resp.json()["id"]
    blocked = await team_client.patch(
        f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage1"}
    )
    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_seat_hold_requires_stage(admin_client: AsyncClient):
    lead_id = await _lead_at_day3(admin_client)
    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}", json={"collect_seat_hold": True}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_seat_hold_starts_window(admin_client: AsyncClient):
    lead_id = await _lead_at_day3(admin_client)
    await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage3"})
    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}", json={"collect_seat_hold": True}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["seat_hold_expiry"] is not None
    assert body["process_tracking"]["day3"]["day3_seat_hold"] is True


@pytest.mark.asyncio
async def test_seat_hold_expiry_sweep(admin_client: AsyncClient, engine):
    lead_id = await _lead_at_day3(admin_client)
    await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage1"})
    await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"collect_seat_hold": True})

    # force the reserve window into the past
    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        lead.seat_hold_expiry = datetime.now(timezone.utc) - timedelta(minutes=1)
        await s.commit()

    async with AsyncSession(engine, expire_on_commit=False) as s:
        swept = await expire_stale_seat_holds(s)
        assert swept >= 1

    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        assert lead.seat_hold_expiry is None
        assert lead.process_tracking["day3"]["day3_seat_hold"] is False
        # stage selection itself is untouched by the seat-hold lapse
        assert lead.stage_selected == "stage1"
