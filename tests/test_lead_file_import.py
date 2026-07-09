"""Unit tests for lead PDF / Excel import helpers."""

import asyncio
import io

import conftest as test_conftest
from openpyxl import Workbook
from sqlalchemy import delete, select

from app.models.lead import Lead
from app.services import lead_file_import
from app.services.lead_file_import import (
    extract_leads_from_xlsx_bytes,
    normalize_phone_digits,
)


def test_normalize_phone_digits_last_ten():
    assert normalize_phone_digits("+91 98765 43210") == "9876543210"
    assert normalize_phone_digits("919876543210") == "9876543210"


def _xlsx_bytes(headers, rows) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_extract_leads_from_xlsx_maps_headers_any_order():
    content = _xlsx_bytes(
        ["City", "Phone Number", "Full Name", "Email"],
        [["Pune", 9812345678, "Amit", "a@x.com"]],
    )
    rows, err = extract_leads_from_xlsx_bytes(content)
    assert err is None
    assert rows == [
        {
            "name": "Amit",
            "phone": "9812345678",
            "email": "a@x.com",
            "city": "Pune",
            "source": None,
            "extra_notes": None,
        }
    ]


def test_extract_leads_from_xlsx_requires_name_or_phone_header():
    rows, err = extract_leads_from_xlsx_bytes(_xlsx_bytes(["Foo", "Bar"], [["a", "b"]]))
    assert rows == []
    assert err and "Name or Phone" in err


def test_extract_leads_from_xlsx_rejects_non_xlsx_bytes():
    rows, err = extract_leads_from_xlsx_bytes(b"not a real workbook")
    assert rows == []
    assert err and "Could not parse Excel file" in err


async def _clear_leads() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(Lead))
        await session.commit()


async def _run_import() -> Lead:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        result = await lead_file_import.run_personal_lead_import(
            session,
            user_id=3,
            file_bytes=b"%PDF-1.4 stub",
            filename="sample.pdf",
            source_tag="facebook",
        )
        assert result.imported == 1
        row = (await session.execute(select(Lead).order_by(Lead.id.asc()))).scalar_one()
        return row


def test_personal_import_sets_sticky_owner(monkeypatch):
    monkeypatch.setattr(
        lead_file_import,
        "extract_leads_from_pdf_bytes",
        lambda _content: (
            [
                {
                    "name": "Imported Lead",
                    "phone": "9876543210",
                    "email": None,
                    "city": "Delhi",
                    "source": None,
                    "extra_notes": None,
                }
            ],
            None,
        ),
    )
    asyncio.run(_clear_leads())
    try:
        lead = asyncio.run(_run_import())
        assert lead.created_by_user_id == 3
        assert lead.owner_user_id == 3
        assert lead.assigned_to_user_id == 3
    finally:
        asyncio.run(_clear_leads())
