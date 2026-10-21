"""Security Deposit Receipt — A5 portrait PDF (reads well on a phone).

Drawn from the receipt's frozen ``payload_json``; only business details that were blank
when it was issued fall back to today's settings (then ``[FILL IN]``). No GST anywhere.
"""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A5
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.models.deposit import DepositReceipt
from app.services.deposits import (
    DEFAULT_SUPPORT_EMAIL,
    NO_SIGNATURE_LINE,
    PURPOSE_LINE,
    fmt_ist,
)

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
INK = HexColor("#10231d")
MUTED = HexColor("#5a6c64")
LINE = HexColor("#d9e0dc")
GREEN = HexColor("#1f6f4a")
GREEN_BG = HexColor("#e8f3ec")
AMBER = HexColor("#9a6700")
RED = HexColor("#b42318")

TITLE = "Security Deposit Receipt"
STATUS_LABEL = {"held": "HELD", "refunded": "REFUNDED", "cancelled": "CANCELLED"}
STATUS_COLOR = {"held": GREEN, "refunded": AMBER, "cancelled": RED}


def _rupee_font() -> str | None:
    """A font with the ₹ sign (EB Garamond, bundled); None → write "Rs."."""
    try:
        pdfmetrics.getFont("MyleGaramond")
        return "MyleGaramond"
    except KeyError:
        pass
    try:
        pdfmetrics.registerFont(TTFont("MyleGaramond", str(_FONT_DIR / "EBGaramond.ttf")))
        return "MyleGaramond"
    except Exception:  # noqa: BLE001 — a missing font must never break the download
        return None


def _date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def render_receipt_pdf(receipt: DepositReceipt, *, current_business: dict[str, str]) -> bytes:
    p = receipt.payload_json or {}
    biz_snap = p.get("business") or {}
    biz = {k: (biz_snap.get(k) or current_business.get(k) or "") for k in ("name", "email", "operated_by")}
    payer = p.get("payer") or {}
    consent = p.get("consent") or {}
    rupee_font = _rupee_font()
    rupees = receipt.amount_cents // 100
    amount_text = f"₹{rupees}" if rupee_font else f"Rs. {rupees}"

    buf = BytesIO()
    width, height = A5
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"{TITLE} {receipt.receipt_number}")
    c.setAuthor(biz["name"] or "Myle Community")
    margin = 34
    inner = width - 2 * margin
    y = height - margin

    # Business header
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(margin, y - 4, biz["name"] or "Myle Community")
    y -= 20
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    if biz["operated_by"]:
        c.drawString(margin, y, f"Operated by {biz['operated_by']}")
        y -= 11
    c.drawString(margin, y, f"Email: {biz['email'] or DEFAULT_SUPPORT_EMAIL}")
    y -= 14
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(margin, y, width - margin, y)
    y -= 22

    # Title + number + status
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(margin, y, TITLE)
    y -= 17
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(margin, y, "Receipt No.")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(margin + 58, y, receipt.receipt_number)
    status = receipt.status
    label = STATUS_LABEL.get(status, status.upper())
    c.setFont("Helvetica-Bold", 8)
    w = pdfmetrics.stringWidth(label, "Helvetica-Bold", 8) + 14
    c.setFillColor(STATUS_COLOR.get(status, MUTED))
    c.roundRect(width - margin - w, y - 4, w, 14, 7, stroke=0, fill=1)
    c.setFillColor(HexColor("#ffffff"))
    c.drawCentredString(width - margin - w / 2, y, label)
    y -= 13
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(margin, y, "Issued on")
    c.setFillColor(INK)
    c.drawString(margin + 58, y, fmt_ist(receipt.issued_at))
    y -= 20

    # Details
    rows = [
        ("Received from", payer.get("name") or ""),
        ("Mobile", payer.get("phone") or ""),
        ("City", payer.get("city") or "—"),
        ("Date & time of payment", fmt_ist(receipt.paid_at)),
        ("Payment mode", p.get("payment_mode_label") or receipt.payment_mode),
        ("Transaction ID / Payment Ref No.", receipt.payment_ref),
    ]
    label_w = 150
    for k, v in rows:
        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED)
        c.drawString(margin, y, k)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9.5)
        lines = simpleSplit(str(v), "Helvetica-Bold", 9.5, inner - label_w) or [""]
        for i, line in enumerate(lines):
            c.drawString(margin + label_w, y - i * 12, line)
        y -= 12 * len(lines) + 5
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(margin, y + 2, width - margin, y + 2)
        y -= 9

    # Amount box
    y -= 4
    box_h = 54
    c.setFillColor(GREEN_BG)
    c.roundRect(margin, y - box_h, inner, box_h, 8, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(margin + 12, y - 15, "Amount received (security deposit)")
    c.setFillColor(GREEN)
    c.setFont(rupee_font or "Helvetica-Bold", 22)
    c.drawString(margin + 12, y - 38, amount_text)
    c.setFillColor(INK)
    c.setFont("Helvetica-Oblique", 8.5)
    words = p.get("amount_words") or ""
    for i, line in enumerate(simpleSplit(words, "Helvetica-Oblique", 8.5, inner - 110)):
        c.drawRightString(width - margin - 12, y - 33 + -11 * i, line)
    y -= box_h + 16

    # Purpose / refund / consent
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y, "Purpose")
    y -= 12
    c.setFont("Helvetica", 9)
    for line in simpleSplit(PURPOSE_LINE, "Helvetica", 9, inner):
        c.drawString(margin, y, line)
        y -= 11.5
    y -= 10

    if status == "refunded":
        c.setFillColor(AMBER)
        c.setFont("Helvetica-Bold", 9)
        refund = f"Refunded on {fmt_ist(receipt.refunded_at)}"
        c.drawString(margin, y, refund)
        y -= 12
        c.setFont("Helvetica", 9)
        c.drawString(margin, y, f"Refund Transaction ID: {receipt.refund_ref or ''}")
        y -= 15
    elif status == "cancelled":
        c.setFillColor(RED)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, y, f"Cancelled on {fmt_ist(receipt.cancelled_at)} — this receipt is void.")
        y -= 15

    given = _date(consent.get("given_at"))
    if given:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        seal = (consent.get("evidence_sha256") or "")[:12]
        text = (
            f"Deposit consent given by the payer online on {fmt_ist(given)} "
            f"(terms {consent.get('terms_version') or ''}, ref C-{consent.get('id')}, {seal})."
        )
        for line in simpleSplit(text, "Helvetica", 8, inner):
            c.drawString(margin, y, line)
            y -= 10

    # Footer
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(margin, margin + 26, width - margin, margin + 26)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, margin + 13, NO_SIGNATURE_LINE)
    c.drawCentredString(width / 2, margin + 2, "This is a deposit receipt, not a tax invoice.")

    if status == "cancelled":
        c.saveState()
        c.setFillColor(RED)
        c.setFillAlpha(0.12)
        c.setFont("Helvetica-Bold", 60)
        c.translate(width / 2, height / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, "CANCELLED")
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()


def receipt_filename(receipt: DepositReceipt) -> str:
    return f"{receipt.receipt_number}.pdf"
