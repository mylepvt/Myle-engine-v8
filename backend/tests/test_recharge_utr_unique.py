"""A UTR number can be used only once across recharge requests."""
import pytest

_URL = "/api/v1/wallet/recharge-requests"


@pytest.mark.asyncio
async def test_duplicate_utr_rejected(team_client):
    first = await team_client.post(
        _URL, json={"amount_cents": 50000, "utr_number": "UTR12345"}
    )
    assert first.status_code == 201, first.text

    # Same UTR again — even with different casing/spacing — is refused.
    dup = await team_client.post(
        _URL, json={"amount_cents": 70000, "utr_number": "  utr12345 "}
    )
    assert dup.status_code == 409, dup.text
    assert "already been used" in dup.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_distinct_utr_allowed(team_client):
    a = await team_client.post(
        _URL, json={"amount_cents": 10000, "utr_number": "UNIQUE-AAA"}
    )
    b = await team_client.post(
        _URL, json={"amount_cents": 10000, "utr_number": "UNIQUE-BBB"}
    )
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text
