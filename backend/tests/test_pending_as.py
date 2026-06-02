"""Pending AS process queue — converted leads awaiting FLP-invoice / CC approval."""
from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead_sale import LeadSale

_PHONE = iter(range(9150000000, 9150009999))

_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
    b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _converted_lead(admin_client: AsyncClient) -> int:
    resp = await admin_client.post(
        "/api/v1/leads",
        json={"name": "AS Candidate", "status": "new_lead", "phone": str(next(_PHONE))},
    )
    assert resp.status_code == 201, resp.text
    lead_id = resp.json()["id"]
    assert (await admin_client.patch(f"/api/v1/leads/{lead_id}", json={"status": "converted"})).status_code == 200
    return lead_id


@pytest.mark.asyncio
async def test_converted_lead_appears_then_clears(admin_client: AsyncClient, engine):
    lead_id = await _converted_lead(admin_client)

    listed = await admin_client.get("/api/v1/pending-as")
    assert listed.status_code == 200, listed.text
    ids = [r["id"] for r in listed.json()["items"]]
    assert lead_id in ids, "converted lead with no approved sale must be pending AS"

    # A Day-3 STAGE-PAYMENT proof creates an approved LeadSale but with NULL case_credits
    # — the CC/FOREVER invoice is still due, so the lead must STAY in pending AS.
    up = await admin_client.post(
        "/api/v1/payments/proof/upload",
        files={"proof_file": ("p.png", _PNG, "image/png")},
        data={"lead_id": str(lead_id), "payment_amount_cents": "800000"},
    )
    assert up.status_code == 200, up.text
    ap = await admin_client.post(f"/api/v1/payments/proof/approve?lead_id={lead_id}")
    assert ap.status_code == 200, ap.text

    still = await admin_client.get("/api/v1/pending-as")
    assert lead_id in [r["id"] for r in still.json()["items"]], (
        "stage-payment approval (no case_credits) must NOT clear the lead from pending AS"
    )

    # Approving the FOREVER invoice (case_credits parsed via OCR) is what clears it.
    async with AsyncSession(engine, expire_on_commit=False) as s:
        sale = (
            await s.execute(select(LeadSale).where(LeadSale.lead_id == lead_id))
        ).scalar_one()
        sale.case_credits = Decimal("1.5")
        await s.commit()

    after = await admin_client.get("/api/v1/pending-as")
    assert lead_id not in [r["id"] for r in after.json()["items"]], (
        "approved CC invoice (case_credits set) must clear the lead from pending AS"
    )
