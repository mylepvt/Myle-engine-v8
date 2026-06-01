"""Pending AS process queue — converted leads awaiting FLP-invoice / CC approval."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

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
async def test_converted_lead_appears_then_clears(admin_client: AsyncClient):
    lead_id = await _converted_lead(admin_client)

    listed = await admin_client.get("/api/v1/pending-as")
    assert listed.status_code == 200, listed.text
    ids = [r["id"] for r in listed.json()["items"]]
    assert lead_id in ids, "converted lead with no approved sale must be pending AS"

    # An approved sale (FLP invoice processed) removes it from the queue.
    up = await admin_client.post(
        "/api/v1/payments/proof/upload",
        files={"proof_file": ("p.png", _PNG, "image/png")},
        data={"lead_id": str(lead_id), "payment_amount_cents": "800000"},
    )
    assert up.status_code == 200, up.text
    ap = await admin_client.post(f"/api/v1/payments/proof/approve?lead_id={lead_id}")
    assert ap.status_code == 200, ap.text

    after = await admin_client.get("/api/v1/pending-as")
    assert after.status_code == 200
    ids_after = [r["id"] for r in after.json()["items"]]
    assert lead_id not in ids_after, "approved CC sale must clear the lead from pending AS"
