"""Unit tests for admin pool Excel parsing (no DB)."""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook

from app.services.lead_pool_import import parse_pool_xlsx_rows


def _xlsx_bytes(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_standard_headers_and_row() -> None:
    content = _xlsx_bytes(
        [
            [
                "Submit Time",
                "Full Name",
                "Age",
                "Gender",
                "Phone Number (Calling Number)",
                "Your City Name",
                "AD Name",
            ],
            ["2024-01-15", "Ravi Kumar", 32, "Male", "9876543210", "Jaipur", "Alpha Ads"],
        ]
    )
    rows, warnings = parse_pool_xlsx_rows(content)
    assert not warnings or all("No data" not in w for w in warnings)
    assert len(rows) == 1
    assert rows[0]["name"] == "Ravi Kumar"
    assert rows[0]["age"] == 32
    assert rows[0]["gender"] == "Male"
    assert rows[0]["phone"] == "9876543210"
    assert rows[0]["city"] == "Jaipur"
    assert rows[0]["ad_name"] == "Alpha Ads"


def test_missing_name_column_errors() -> None:
    content = _xlsx_bytes([["X"], ["1"]])
    rows, warnings = parse_pool_xlsx_rows(content)
    assert rows == []
    assert warnings
