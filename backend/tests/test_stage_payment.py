"""Day 3 stage payment — screenshot upload → admin approve → LeadSale record.

Reuses the existing payment-proof endpoints (the Day-3 closing stage payment lands
to the lead owner = leader account, recorded as an approved LeadSale).
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.lead_sale import LeadSale

_PHONE = iter(range(9140000000, 9140009999))

# 1x1 transparent PNG
_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
    b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _day3_lead_with_stage(admin_client: AsyncClient) -> int:
    resp = await admin_client.post(
        "/api/v1/leads",
        json={"name": "Payer", "status": "new_lead", "phone": str(next(_PHONE))},
    )
    assert resp.status_code == 201, resp.text
    lead_id = resp.json()["id"]
    assert (await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "day3"})).status_code == 200
    assert (
        await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"stage_selected": "stage1"})
    ).status_code == 200
    return lead_id


@pytest.mark.asyncio
async def test_stage_payment_upload_then_approve_records_sale(admin_client: AsyncClient, engine):
    lead_id = await _day3_lead_with_stage(admin_client)

    up = await admin_client.post(
        "/api/v1/payments/proof/upload",
        files={"proof_file": ("proof.png", _PNG, "image/png")},
        data={"lead_id": str(lead_id), "payment_amount_cents": "800000", "notes": "stage"},
    )
    assert up.status_code == 200, up.text
    assert up.json()["payment_status"] == "proof_uploaded"

    ap = await admin_client.post(f"/api/v1/payments/proof/approve?lead_id={lead_id}")
    assert ap.status_code == 200, ap.text
    assert ap.json()["payment_status"] == "approved"

    async with AsyncSession(engine, expire_on_commit=False) as s:
        lead = await s.get(Lead, lead_id)
        assert lead.payment_status == "approved"
        sale = (
            await s.execute(select(LeadSale).where(LeadSale.lead_id == lead_id))
        ).scalar_one()
        assert sale.status == "approved"
        assert sale.amount_cents == 800000
        assert sale.billing_stage == "day3"
        assert sale.owner_user_id is not None  # credited to the lead owner (leader account)


@pytest.mark.asyncio
async def test_stage_payment_rejects_non_image(admin_client: AsyncClient):
    lead_id = await _day3_lead_with_stage(admin_client)
    bad = await admin_client.post(
        "/api/v1/payments/proof/upload",
        files={"proof_file": ("note.txt", b"hello", "text/plain")},
        data={"lead_id": str(lead_id), "payment_amount_cents": "800000"},
    )
    assert bad.status_code == 400
