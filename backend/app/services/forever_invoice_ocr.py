"""FOREVER Tax Invoice OCR + field extraction (Tesseract, local, no API key).

Runs Tesseract over an uploaded invoice image and regex-parses the FOREVER
template into structured fields. Tesseract is optional at runtime: if the binary
or Python bindings are missing, ``ocr_available`` is False and the caller routes
the record to the admin queue instead of crashing.

Extracted fields (best-effort, OCR-noise tolerant):
- invoice_number   e.g. 2627-027-006305
- amount_cents     "Invoice Total" rupees → paise
- case_credits     "Total" CC column, e.g. 1.002
- fbo_id           buyer Forever Business Owner id
- sponsor_id       upline sponsor id
- order_count      "Order Count N"
- invoice_date     "Invoice Date : 25 May 2026"

``confidence`` = fraction of the critical fields parsed (invoice_number, amount,
case_credits, invoice_date). The verify engine combines it with business rules.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

# Critical fields used for the confidence score (order-independent).
_CRITICAL_FIELDS = ("invoice_number", "amount_cents", "case_credits", "invoice_date")

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


@dataclass
class ExtractedInvoice:
    """Structured output of the FOREVER invoice parse."""

    ocr_available: bool = True
    raw_text: str = ""
    invoice_number: Optional[str] = None
    amount_cents: Optional[int] = None
    case_credits: Optional[Decimal] = None
    fbo_id: Optional[str] = None
    sponsor_id: Optional[str] = None
    order_count: Optional[int] = None
    invoice_date: Optional[date] = None
    confidence: float = 0.0
    parsed_fields: list[str] = field(default_factory=list)

    def recompute_confidence(self) -> None:
        present = [f for f in _CRITICAL_FIELDS if getattr(self, f) is not None]
        self.parsed_fields = present
        self.confidence = round(len(present) / len(_CRITICAL_FIELDS), 3)


def _ocr_image_to_text(data: bytes) -> tuple[bool, str]:
    """Return (ocr_available, text). Never raises — missing deps → (False, "")."""
    try:
        import io

        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception:
        return False, ""
    try:
        image = Image.open(io.BytesIO(data))
        # Greyscale lifts contrast on phone photos of glossy invoices.
        image = image.convert("L")
        text = pytesseract.image_to_string(image)
        return True, text or ""
    except pytesseract.TesseractNotFoundError:  # type: ignore[attr-defined]
        return False, ""
    except Exception:
        # Corrupt image / decode failure — treat as no OCR, let admin handle.
        return False, ""


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _parse_amount_to_cents(raw: str) -> Optional[int]:
    cleaned = (raw or "").replace(",", "").strip()
    if not cleaned:
        return None
    try:
        rupees = Decimal(cleaned)
    except InvalidOperation:
        return None
    if rupees <= 0:
        return None
    return int((rupees * 100).quantize(Decimal("1")))


def _parse_invoice_date(raw: str) -> Optional[date]:
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", raw or "")
    if not m:
        return None
    day_s, mon_s, year_s = m.groups()
    month = _MONTHS.get(mon_s[:3].lower())
    if month is None:
        return None
    try:
        return date(int(year_s), month, int(day_s))
    except ValueError:
        return None


def _extract_fields(text: str, out: ExtractedInvoice) -> None:
    # Invoice number: NNNN-NNN-NNNNNN (allow OCR 'O'→'0' in the digit groups).
    norm = text.replace("O", "0").replace("o", "0")
    m = re.search(r"\b(\d{4}-\d{3}-\d{6})\b", norm)
    if m:
        out.invoice_number = m.group(1)

    # Invoice Total : 19978.00  (preferred over per-line "Net Amt").
    m = re.search(
        r"Invoice\s*Total\s*[:\-]?\s*([\d,]+\.\d{1,2})", text, re.IGNORECASE
    )
    if not m:
        m = re.search(
            r"Total\s*Amount\s*[:\-]?\s*([\d,]+\.\d{1,2})", text, re.IGNORECASE
        )
    if m:
        out.amount_cents = _parse_amount_to_cents(m.group(1))

    # Case Credits total — the "Total :" row's CC value (small decimal, < 1000).
    # Pick the first small decimal that follows a "Total" token.
    for tm in re.finditer(r"Total\s*[:\-]?\s*([\d,]+\.\d{2,3})", text, re.IGNORECASE):
        try:
            val = Decimal(tm.group(1).replace(",", ""))
        except InvalidOperation:
            continue
        if Decimal("0") < val < Decimal("1000"):
            out.case_credits = val
            break

    # FBO ID : 910711594952
    m = re.search(r"FBO\s*ID\s*[:\-]?\s*(\d[\d\s]{7,16})", text, re.IGNORECASE)
    if m:
        out.fbo_id = _digits(m.group(1)) or None

    # Sponsors Id : 910711242522
    m = re.search(r"Sponsor[s]?\s*Id\s*[:\-]?\s*(\d[\d\s]{7,16})", text, re.IGNORECASE)
    if m:
        out.sponsor_id = _digits(m.group(1)) or None

    # Order Count 2
    m = re.search(r"Order\s*Count\s*[:\-]?\s*(\d{1,3})", text, re.IGNORECASE)
    if m:
        try:
            out.order_count = int(m.group(1))
        except ValueError:
            out.order_count = None

    # Invoice Date : 25 May 2026
    m = re.search(r"Invoice\s*Date\s*[:\-]?\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})",
                  text, re.IGNORECASE)
    if m:
        out.invoice_date = _parse_invoice_date(m.group(1))


def extract_forever_invoice(data: bytes) -> ExtractedInvoice:
    """OCR + parse an invoice image. Always returns a result (never raises)."""
    out = ExtractedInvoice()
    available, text = _ocr_image_to_text(data)
    out.ocr_available = available
    out.raw_text = text
    if available and text.strip():
        _extract_fields(text, out)
    out.recompute_confidence()
    return out
