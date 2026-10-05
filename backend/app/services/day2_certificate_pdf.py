"""Landscape PDF for Day 2 Business Evaluation — Certificate of Qualification.

Same official look as the training certificate (guilloche border, official seal,
ribbon, red serial number, QR, microtext) with the Day 2 wording and signatories.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO

from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.services.certificate import (
    GOLD,
    GOLD_DEEP,
    GREEN_DARK,
    INK,
    MUTED,
    RED,
    _border,
    _diamond,
    _emblem,
    _fit_size,
    _fonts,
    _microtext_line,
    _official_seal,
    _paper,
    _qr,
    _ribbon,
    _rule,
    _spaced,
    _wrap,
)

BODY = (
    "has successfully completed the Day 2 Business Evaluation Process and demonstrated the "
    "required understanding, discipline, and clarity to move forward within the MYLE Community "
    "system. This certification confirms eligibility for the Interview Stage."
)
SIGNATORIES = (
    ("Karanveer Singh", "CEO & Founder · MYLE Community"),
    ("Shikha Singh", "Management · MYLE Community"),
)


def day2_certificate_number(session_id: int, issued_on: datetime) -> str:
    return f"MYLE/D2/{issued_on.year}/{session_id:05d}"


def build_day2_business_certificate_pdf(
    recipient_name: str,
    score: int,
    total_questions: int,
    date_display: str,
    cert_no: str | None = None,
    year: int | None = None,
) -> bytes:
    recipient_name = " ".join((recipient_name or "").split()) or "Participant"
    date_display = (date_display or "").strip() or "—"
    year = year or datetime.now().year
    f = _fonts()
    w, h = landscape(A4)
    cx = w / 2
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    c.setTitle(f"Certificate of Qualification — {recipient_name}")
    c.setAuthor("MYLE Community")
    c.setSubject("Day 2 Business Evaluation")

    _paper(c, w, h, f["display"])
    _border(c, w, h)

    if cert_no:
        c.setFillColor(RED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(64, h - 68, f"Sl. No. {cert_no}")

    # Header
    _emblem(c, cx, h - 98, f["display"], year)
    _spaced(c, "MYLE COMMUNITY", cx, h - 166, f["display"], 30, 3.5, bold=0.7, color=GREEN_DARK)
    _ribbon(c, cx, h - 188, "DAY 2 BUSINESS EVALUATION", "Helvetica-Bold", 7.5)
    _spaced(c, "CERTIFICATE OF QUALIFICATION", cx, h - 226, f["display"], 20, 2.3, bold=0.45, color=GOLD_DEEP)
    _rule(c, cx, h - 238, 175)

    # Recipient
    c.setFillColor(MUTED)
    c.setFont("Times-Italic", 14)
    c.drawCentredString(cx, h - 262, "This is to certify that")
    name_size = _fit_size(recipient_name, f["serif"], 36, 20, w - 260)
    c.setFillColor(GREEN_DARK)
    c.setFont(f["serif"], name_size)
    c.drawCentredString(cx, h - 298, recipient_name)
    half = max(190, stringWidth(recipient_name, f["serif"], name_size) / 2 + 26)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.9)
    c.line(cx - half, h - 309, cx + half, h - 309)
    c.setFillColor(GOLD)
    _diamond(c, cx - half, h - 309, 2.5)
    _diamond(c, cx + half, h - 309, 2.5)

    c.setFillColor(INK)
    y = h - 332
    for line in _wrap(BODY, f["serif"], 12.5, w - 300):
        c.setFont(f["serif"], 12.5)
        c.drawCentredString(cx, y, line)
        y -= 17

    # Details strip: score · status · date
    cols = (
        ("SCORE ACHIEVED", f"{score} / {total_questions}"),
        ("STATUS", "Approved for Interview Stage"),
        ("DATE", date_display),
    )
    strip_y = y - 22
    col_w = 175
    left = cx - col_w * 1.5
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(left, strip_y + 26, left + col_w * 3, strip_y + 26)
    c.line(left, strip_y - 12, left + col_w * 3, strip_y - 12)
    for i, (label, value) in enumerate(cols):
        x = left + col_w * i + col_w / 2
        if i:
            c.line(left + col_w * i, strip_y - 8, left + col_w * i, strip_y + 22)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x, strip_y + 12, label)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawCentredString(x, strip_y - 2, value)

    # Signatures either side, official seal in the middle
    base = 92
    for (name, title), sx in zip(SIGNATORIES, (190, w - 190)):
        c.setFillColor(GREEN_DARK)
        c.setFont(f["script"], _fit_size(name, f["script"], 26, 16, 190))
        c.drawCentredString(sx, base + 4, name)
        c.setStrokeColor(INK)
        c.setLineWidth(0.7)
        c.line(sx - 95, base - 4, sx + 95, base - 4)
        c.setFillColor(INK)
        c.setFont(f["serif"], 11.5)
        c.drawCentredString(sx, base - 17, name)
        c.setFillColor(MUTED)
        c.setFont(f["serif"], 9)
        c.drawCentredString(sx, base - 29, title)
    _official_seal(c, cx, base + 20, 40, year, f["display"])

    if cert_no:
        _qr(
            c, w - 64 - 46, h - 72 - 46, 46,
            f"MYLE COMMUNITY | Certificate of Qualification | No. {cert_no} | {recipient_name} | "
            f"Day 2 Business Evaluation | Score {score}/{total_questions} | {date_display}",
        )

    _microtext_line(c, 60, w - 60, 51)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6)
    footer = "This is a computer-generated certificate issued by Myle Community."
    if cert_no:
        footer += f" Certificate No. {cert_no}."
    c.drawCentredString(cx, 57, footer)

    c.showPage()
    c.save()
    return buf.getvalue()
