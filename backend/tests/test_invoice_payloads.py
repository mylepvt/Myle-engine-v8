from app.services.invoice_html import build_tax_payload_for_claims, build_tax_payload_for_single_lead


def test_build_tax_payload_for_claims_aggregates_multiple_leads() -> None:
    payload = build_tax_payload_for_claims(
        claims=[
            {"lead_ref": "Lead #101", "total_cents": 19600},
            {"lead_ref": "Lead #102", "total_cents": 19600},
            {"lead_ref": "Lead #103", "total_cents": 9900},
        ]
    )

    assert [line["lead_ref"] for line in payload["lines"]] == [
        "Lead #101",
        "Lead #102",
        "Lead #103",
    ]
    assert payload["total_rupees"] == 491.0
    assert payload["subtotal_rupees"] == 416.1
    assert payload["igst_rupees"] == 74.9
    assert payload["amount_in_words"] == "Four Hundred Ninety One Rupees Only"


def test_build_tax_payload_for_single_lead_preserves_single_line_shape() -> None:
    payload = build_tax_payload_for_single_lead(total_cents=19600, lead_ref="Lead #55")

    assert len(payload["lines"]) == 1
    assert payload["lines"][0]["lead_ref"] == "Lead #55"
    assert payload["total_rupees"] == 196.0
