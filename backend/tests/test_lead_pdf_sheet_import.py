"""Calling-board PDF import: Myle lead-sheet format (split phone numbers, decorative table)."""
from __future__ import annotations

import io

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.services.lead_file_import import _parse_pdf_text_line, extract_leads_from_pdf_bytes

# Synthetic rows in the same layout as the "15 LEADS" sheets (made-up names and numbers).
SHEET_ROWS = [
    "1 Riya Sharma 98765 12345 WA 19 to 21 Female Delhi 18 Oct, 11:55 am G5/J/PM-3",
    "2 Neha Verma 87654 23456 WA 22 to 24 Female Meerut 18 Oct, 11:57 am G5/J/PM-2…",
    "3 Aarti Singh 76543 34567 WA 18 Female Silchar Sonai 18 Oct, 12:10 pm G5-37 NEW",
    "4 komal yadav yad… 65432 45678 WA 25 to 28 Male Pune 18 Oct, 12:24 pm N-37",
]


def _lead_sheet_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 60
    for text in ("LEADS", "Myle Community", "15 LEADS-1", "Fresh Meta leads · verified & exclusive",
                 "PREPARED FOR LEADS FEMALE MALE", "Free 4 3 1",
                 "# NAME PHONE AGE GENDER CITY RECEIVED AD"):
        c.drawString(40, y, text)
        y -= 18
    # A ruled grid like the real sheet: pdfplumber reads it as an (empty) table.
    for i in range(len(SHEET_ROWS) + 1):
        c.line(36, y + 14 - i * 18, width - 36, y + 14 - i * 18)
    for row in SHEET_ROWS:
        c.drawString(40, y, row)
        y -= 18
    c.drawString(40, y - 10, "Shared only with you — these leads are never sent to anyone else. Page 1 of 1")
    c.save()
    return buf.getvalue()


def test_lead_sheet_pdf_imports_every_row():
    rows, err = extract_leads_from_pdf_bytes(_lead_sheet_pdf())
    assert err is None
    assert [(r["name"], r["phone"], r["city"]) for r in rows] == [
        ("Riya Sharma", "9876512345", "Delhi"),
        ("Neha Verma", "8765423456", "Meerut"),
        ("Aarti Singh", "7654334567", "Silchar Sonai"),
        ("komal yadav yad", "6543245678", "Pune"),
    ]
    assert rows[0]["extra_notes"] == "Age: 19 to 21 · Gender: Female · Received: 18 Oct, 11:55 am · Ad: G5/J/PM-3"
    assert rows[1]["extra_notes"].endswith("Ad: G5/J/PM-2")  # clipped "…" dropped
    assert rows[2]["extra_notes"] == "Age: 18 · Gender: Female · Received: 18 Oct, 12:10 pm · Ad: G5-37 NEW"
    assert "Gender: Male" in rows[3]["extra_notes"]


def test_plain_name_phone_lines_still_work():
    row = _parse_pdf_text_line("Rohit Kumar - +91 98765-43210")
    assert row is not None
    assert (row["name"], row["phone"], row["city"], row["extra_notes"]) == ("Rohit Kumar", "9876543210", None, None)


def test_lines_without_a_mobile_are_ignored():
    for line in ("# NAME PHONE AGE GENDER CITY RECEIVED AD", "Free 15 15 0", "Myle Community · 18 Oct, 4:06 pm",
                 "12345 67890 not a mobile (starts with 1)"):
        assert _parse_pdf_text_line(line) is None
