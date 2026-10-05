"""Training certificate PDF — a formal, landscape A4 certificate drawn on one canvas.

Styled like an official / government-issued certificate: banknote-style guilloche
border, central rosette watermark, gold-foil emblem, ribbon banner, red serial
number, microtext security line, verification QR code, the founder's and
management's signatures and the MYLE official seal. Everything is placed at fixed coordinates, so the layout
never shifts with the length of the name.
"""

from __future__ import annotations

import math
from datetime import datetime
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ORG_NAME = "MYLE COMMUNITY"
PROGRAMME = "7-Day Onboarding Training Programme"
SIGNATORIES = (
    ("Karanveer Singh", "Founder & CEO, MYLE Community"),
    ("Shikha Singh", "Management, MYLE Community"),
)
# Each signatory keeps their own handwriting style (font key in ``_fonts()``).
SIGNATURE_FONT_KEYS = {"Karanveer Singh": "sig_karanveer", "Shikha Singh": "sig_shikha"}


def signature_font(fonts: dict[str, str], name: str) -> str:
    return fonts[SIGNATURE_FONT_KEYS.get(name, "sig_karanveer")]

GREEN = HexColor("#16432F")
GREEN_DARK = HexColor("#0E2E20")
GOLD = HexColor("#B8923A")
GOLD_DEEP = HexColor("#8A6A22")
GOLD_BRIGHT = HexColor("#E9D28E")
INK = HexColor("#1F231D")
PEN_INK = HexColor("#1B2F66")  # fountain-pen blue for signatures
MUTED = HexColor("#5C6157")
RED = HexColor("#9E1B1B")
PAPER = HexColor("#FBF7EA")
PAPER_EDGE = HexColor("#F1E8CF")

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"


@lru_cache(maxsize=1)
def _fonts() -> dict[str, str]:
    """Register the bundled OFL fonts once; fall back to PDF base fonts if missing."""
    names = {
        "display": "Times-Bold",
        "serif": "Times-Roman",
        "script": "Times-Italic",
        "sig_karanveer": "Times-Italic",
        "sig_shikha": "Times-Italic",
    }
    for key, (alias, filename) in {
        "display": ("MyleCinzel", "Cinzel.ttf"),
        "serif": ("MyleGaramond", "EBGaramond.ttf"),
        "script": ("MyleGreatVibes", "GreatVibes.ttf"),
        "sig_karanveer": ("MyleSigKaranveer", "MrsSaintDelafield.ttf"),
        "sig_shikha": ("MyleSigShikha", "AlexBrush.ttf"),
    }.items():
        try:
            pdfmetrics.registerFont(TTFont(alias, str(_FONT_DIR / filename)))
            names[key] = alias
        except Exception:  # noqa: BLE001 — a missing font must never break the download
            pass
    return names


def certificate_number(user_id: int, issued_on: datetime) -> str:
    """Stable, human-readable certificate number (one per member)."""
    return f"MYLE/TRN/{issued_on.year}/{user_id:05d}"


# ── text helpers ──────────────────────────────────────────────────────────────


def _spaced(c: canvas.Canvas, text: str, x: float, y: float, font: str, size: float, spacing: float,
            bold: float = 0.0, color: Color | None = None) -> float:
    """Draw ``text`` centred on ``x`` with letter spacing; ``bold`` > 0 thickens it. Returns width."""
    widths = [stringWidth(ch, font, size) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    cx = x - total / 2
    c.saveState()
    if color is not None:
        c.setFillColor(color)
        c.setStrokeColor(color)
    c.setLineWidth(bold)
    for ch, wch in zip(text, widths):
        t = c.beginText(cx, y)
        t.setFont(font, size)
        t.setTextRenderMode(2 if bold else 0)
        t.textOut(ch)
        c.drawText(t)
        cx += wch + spacing
    c.restoreState()
    return total


def _fit_size(text: str, font: str, max_size: float, min_size: float, max_width: float) -> float:
    size = max_size
    while size > min_size and stringWidth(text, font, size) > max_width:
        size -= 1
    return size


def _wrap(text: str, font: str, size: float, max_width: float) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if stringWidth(trial, font, size) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


# ── shapes ────────────────────────────────────────────────────────────────────


def _diamond(c: canvas.Canvas, x: float, y: float, r: float) -> None:
    p = c.beginPath()
    p.moveTo(x, y + r)
    p.lineTo(x + r, y)
    p.lineTo(x, y - r)
    p.lineTo(x - r, y)
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def _rosette(c: canvas.Canvas, cx: float, cy: float, big_r: float, small_r: float, d: float,
             turns: int, color: Color, width: float) -> None:
    """Hypotrochoid (spirograph) curve — the classic banknote guilloche rosette."""
    c.setStrokeColor(color)
    c.setLineWidth(width)
    p = c.beginPath()
    steps = 1400
    k = (big_r - small_r) / small_r
    for i in range(steps + 1):
        t = 2 * math.pi * turns * i / steps
        x = cx + (big_r - small_r) * math.cos(t) + d * math.cos(k * t)
        y = cy + (big_r - small_r) * math.sin(t) - d * math.sin(k * t)
        if i == 0:
            p.moveTo(x, y)
        else:
            p.lineTo(x, y)
    c.drawPath(p, stroke=1, fill=0)


def _leaf(c: canvas.Canvas, x: float, y: float, angle_deg: float, length: float, width: float) -> None:
    c.saveState()
    c.translate(x, y)
    c.rotate(angle_deg)
    p = c.beginPath()
    p.moveTo(0, 0)
    p.curveTo(length * 0.3, width, length * 0.7, width, length, 0)
    p.curveTo(length * 0.7, -width, length * 0.3, -width, 0, 0)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.restoreState()


def _laurel(c: canvas.Canvas, cx: float, cy: float, radius: float, color: Color) -> None:
    """Two laurel branches curving up either side of a medallion."""
    c.setFillColor(color)
    c.setStrokeColor(color)
    c.setLineWidth(0.8)
    for side in (-1, 1):
        # Stem: from the bottom of the medallion, up the side
        p = c.beginPath()
        for i in range(31):
            a = math.radians(-90 + side * (18 + i * 4.2))
            x, y = cx + radius * math.cos(a), cy + radius * math.sin(a)
            if i == 0:
                p.moveTo(x, y)
            else:
                p.lineTo(x, y)
        c.drawPath(p, stroke=1, fill=0)
        for i in range(8):
            a_deg = -90 + side * (24 + i * 14.5)
            a = math.radians(a_deg)
            x, y = cx + radius * math.cos(a), cy + radius * math.sin(a)
            # direction of travel along the stem (pointing upward)
            travel = a_deg + 90 * side
            _leaf(c, x, y, travel + 40, 9, 2.5)
            _leaf(c, x, y, travel - 40, 9, 2.5)


# ── layers ────────────────────────────────────────────────────────────────────


def _paper(c: canvas.Canvas, w: float, h: float, display_font: str) -> None:
    c.saveState()
    c.radialGradient(w / 2, h / 2, w * 0.62, (PAPER, PAPER, PAPER_EDGE), (0, 0.55, 1), extend=True)
    c.restoreState()

    inner = c.beginPath()
    inner.rect(46, 46, w - 92, h - 92)
    c.saveState()
    c.clipPath(inner, stroke=0, fill=0)

    # Microtext field
    c.setFillColor(Color(0.13, 0.30, 0.22, alpha=0.04))
    c.setFont("Helvetica", 4.2)
    row = "MYLECOMMUNITY " * 60
    y, shift = 48.0, 0.0
    while y < h - 46:
        c.drawString(40 - shift, y, row)
        y += 6.2
        shift = (shift + 17) % 60

    # Central guilloche rosette watermark
    for i, (rr, dd) in enumerate(((150, 55), (132, 48), (114, 40))):
        _rosette(c, w / 2, h / 2 - 22, rr, 150 / 13.0 + i * 2, dd, 13,
                 Color(0.55, 0.43, 0.15, alpha=0.12), 0.35)
    _rosette(c, w / 2, h / 2 - 22, 60, 60 / 9.0, 22, 9, Color(0.09, 0.26, 0.18, alpha=0.10), 0.3)
    c.setFillColor(Color(0.09, 0.26, 0.18, alpha=0.045))
    c.setFont(display_font, 120)
    c.drawCentredString(w / 2, h / 2 - 64, "M")

    # Guilloche bands along the top and bottom
    for base_y, sign in ((66, 1), (h - 66, -1)):
        for k in range(5):
            p = c.beginPath()
            for i in range(0, 361):
                x = 46 + (w - 92) * i / 360
                yy = base_y + sign * 6 * math.sin(i / 360 * math.pi * 26 + k * 0.7)
                if i == 0:
                    p.moveTo(x, yy)
                else:
                    p.lineTo(x, yy)
            c.setStrokeColor(Color(0.55, 0.43, 0.15, alpha=0.12))
            c.setLineWidth(0.3)
            c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def _border(c: canvas.Canvas, w: float, h: float) -> None:
    """Deep-green band filled with interlaced gold guilloche waves, gold rules, corner medallions."""
    outer, inner = 14.0, 38.0
    band = c.beginPath()
    band.rect(outer, outer, w - 2 * outer, h - 2 * outer)
    band.rect(inner, inner, w - 2 * inner, h - 2 * inner)
    c.saveState()
    c.setFillColor(GREEN_DARK)
    c.drawPath(band, stroke=0, fill=1, fillMode=0)  # even-odd → a ring
    c.clipPath(band, stroke=0, fill=0, fillMode=0)
    mid = (outer + inner) / 2
    amp = (inner - outer) / 2 - 3
    c.setLineWidth(0.55)
    faint = Color(0.72, 0.57, 0.23, alpha=0.5)
    for phase, color in ((0.0, GOLD), (math.pi, GOLD), (math.pi / 2, faint), (3 * math.pi / 2, faint)):
        c.setStrokeColor(color)
        for horizontal, fixed in ((True, mid), (True, h - mid), (False, mid), (False, w - mid)):
            p = c.beginPath()
            length = w if horizontal else h
            steps = int(length / 1.5)
            for i in range(steps + 1):
                s = length * i / steps
                off = amp * math.sin(s / 9.0 + phase)
                x, y = (s, fixed + off) if horizontal else (fixed + off, s)
                if i == 0:
                    p.moveTo(x, y)
                else:
                    p.lineTo(x, y)
            c.drawPath(p, stroke=1, fill=0)
    c.restoreState()

    c.setStrokeColor(GOLD)
    c.setLineWidth(1.6)
    c.rect(outer, outer, w - 2 * outer, h - 2 * outer)
    c.setLineWidth(1.2)
    c.rect(inner, inner, w - 2 * inner, h - 2 * inner)
    c.setStrokeColor(GREEN)
    c.setLineWidth(0.8)
    c.rect(inner + 5, inner + 5, w - 2 * inner - 10, h - 2 * inner - 10)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.4)
    c.rect(inner + 8, inner + 8, w - 2 * inner - 16, h - 2 * inner - 16)

    for x, y in ((mid, mid), (w - mid, mid), (mid, h - mid), (w - mid, h - mid)):
        c.setFillColor(GOLD)
        c.circle(x, y, 15, stroke=0, fill=1)
        c.setFillColor(GREEN_DARK)
        c.circle(x, y, 12.5, stroke=0, fill=1)
        _rosette(c, x, y, 11, 11 / 5.0, 5.5, 5, GOLD_BRIGHT, 0.4)
        c.setFillColor(GOLD_BRIGHT)
        c.circle(x, y, 1.6, stroke=0, fill=1)


def _gold_disc(c: canvas.Canvas, cx: float, cy: float, r: float) -> None:
    clip = c.beginPath()
    clip.circle(cx, cy, r)
    c.saveState()
    c.clipPath(clip, stroke=0, fill=0)
    c.linearGradient(cx - r, cy + r, cx + r, cy - r, (GOLD_BRIGHT, GOLD, GOLD_DEEP, GOLD, GOLD_BRIGHT),
                     (0, 0.3, 0.55, 0.8, 1), extend=True)
    c.restoreState()


def _emblem(c: canvas.Canvas, cx: float, cy: float, display_font: str, year: int) -> None:
    """Brand mark: the MYLE official seal framed by a gold laurel."""
    _laurel(c, cx, cy, 42, GOLD)
    _official_seal(c, cx, cy, 32, year, display_font)


def _ribbon(c: canvas.Canvas, cx: float, cy: float, text: str, font: str, size: float) -> None:
    spacing = 2.4
    text_w = sum(stringWidth(ch, font, size) for ch in text) + spacing * (len(text) - 1)
    half = text_w / 2 + 24
    hgt = 18
    c.setFillColor(GREEN_DARK)
    for side in (-1, 1):
        t = c.beginPath()
        x0 = cx + side * (half - 8)
        top, bot = cy + hgt / 2 - 5, cy - hgt / 2 - 5
        t.moveTo(x0, bot)
        t.lineTo(x0 + side * 30, bot)
        t.lineTo(x0 + side * 21, (top + bot) / 2)
        t.lineTo(x0 + side * 30, top)
        t.lineTo(x0, top)
        t.close()
        c.drawPath(t, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.rect(cx - half, cy - hgt / 2, 2 * half, hgt, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(cx - half, cy + hgt / 2 - 2.5, cx + half, cy + hgt / 2 - 2.5)
    c.line(cx - half, cy - hgt / 2 + 2.5, cx + half, cy - hgt / 2 + 2.5)
    _spaced(c, text, cx, cy - size / 2 + 1.4, font, size, spacing, color=GOLD_BRIGHT)


def _signature(c: canvas.Canvas, cx: float, y: float, name: str, font: str, max_width: float = 150) -> None:
    """Handwritten signature: pen-blue cursive, a slight upward slant and an ink swoosh."""
    size = _fit_size(name, font, 34, 18, max_width)
    width = stringWidth(name, font, size)
    c.saveState()
    c.translate(cx, y)
    c.rotate(4)
    c.setFillColor(PEN_INK)
    c.setFont(font, size)
    c.drawCentredString(0, 0, name)
    # Swoosh under the name, like the pen trailing off after signing
    c.setStrokeColor(PEN_INK)
    c.setLineCap(1)
    c.setLineWidth(0.9)
    p = c.beginPath()
    x0 = -width * 0.42
    p.moveTo(x0, -size * 0.18)
    p.curveTo(x0 + width * 0.25, -size * 0.34, x0 + width * 0.6, -size * 0.10, width * 0.5, -size * 0.06)
    c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def _rule(c: canvas.Canvas, cx: float, y: float, half: float, gap: float = 8) -> None:
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(cx - half, y, cx - gap, y)
    c.line(cx + gap, y, cx + half, y)
    c.setLineWidth(0.4)
    c.line(cx - half + 16, y - 3, cx - gap - 6, y - 3)
    c.line(cx + gap + 6, y - 3, cx + half - 16, y - 3)
    c.setFillColor(GOLD)
    _diamond(c, cx, y, 3.5)


NAVY = HexColor("#14284B")
NAVY_DEEP = HexColor("#0C1A33")


def _official_seal(c: canvas.Canvas, cx: float, cy: float, r: float, year: int, display_font: str) -> None:
    """MYLE official seal: scalloped gold-foil rim, navy disc, ring lettering, M · CERTIFIED · year."""
    c.saveState()
    _official_seal_body(c, cx, cy, r, year, display_font)
    c.restoreState()


def _official_seal_body(c: canvas.Canvas, cx: float, cy: float, r: float, year: int, display_font: str) -> None:
    # Shadow for weight
    c.setFillColor(Color(0, 0, 0, alpha=0.18))
    c.circle(cx + 1.6, cy - 2.0, r, stroke=0, fill=1)
    # Scalloped rim (gold foil gradient)
    rim = c.beginPath()
    points = 56
    for i in range(points * 2 + 1):
        a = 2 * math.pi * i / (points * 2)
        rr = r + 4.5 if i % 2 == 0 else r + 0.5
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        if i == 0:
            rim.moveTo(x, y)
        else:
            rim.lineTo(x, y)
    rim.close()
    c.saveState()
    c.clipPath(rim, stroke=0, fill=0)
    c.linearGradient(cx - r, cy + r, cx + r, cy - r, (GOLD_DEEP, HexColor("#D9B65C"), GOLD, GOLD_DEEP, HexColor("#C9A24A")),
                     (0, 0.25, 0.5, 0.75, 1), extend=True)
    c.restoreState()
    # Navy disc with gold rings
    c.setFillColor(NAVY_DEEP)
    c.circle(cx, cy, r - 3, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.circle(cx, cy, r - 5, stroke=0, fill=1)
    c.setStrokeColor(GOLD_BRIGHT)
    c.setLineWidth(1.2)
    c.circle(cx, cy, r - 7.5, stroke=1, fill=0)
    c.setLineWidth(0.5)
    c.circle(cx, cy, r - 9.5, stroke=1, fill=0)
    c.setLineWidth(1.0)
    c.circle(cx, cy, r * 0.52, stroke=1, fill=0)
    c.setLineWidth(0.4)
    c.circle(cx, cy, r * 0.52 - 2.2, stroke=1, fill=0)

    # Ring lettering
    ring = "MYLE COMMUNITY  •  OFFICIAL SEAL  •  "
    size = r * 0.155
    radius = (r - 9.5 + r * 0.52) / 2 - size / 3
    c.setFillColor(GOLD_BRIGHT)
    n = len(ring)
    for i, ch in enumerate(ring):
        a = math.pi / 2 - 2 * math.pi * i / n
        c.saveState()
        c.translate(cx + radius * math.cos(a), cy + radius * math.sin(a))
        c.rotate(math.degrees(a) - 90)
        t = c.beginText(-stringWidth(ch, "Helvetica-Bold", size) / 2, 0)
        t.setFont("Helvetica-Bold", size)
        t.textOut(ch)
        c.drawText(t)
        c.restoreState()

    # Centre: M · CERTIFIED · year
    c.setFillColor(GOLD_BRIGHT)
    c.setStrokeColor(GOLD_BRIGHT)
    c.setLineWidth(0.5)
    t = c.beginText()
    t.setTextRenderMode(2)
    m_size = r * 0.36
    t.setTextOrigin(cx - stringWidth("M", display_font, m_size) / 2, cy + r * 0.02)
    t.setFont(display_font, m_size)
    t.textOut("M")
    t.setTextRenderMode(0)
    c.drawText(t)
    c.setFont("Helvetica-Bold", r * 0.11)
    c.drawCentredString(cx, cy - r * 0.15, "CERTIFIED")
    c.setFont("Helvetica-Bold", r * 0.1)
    c.drawCentredString(cx, cy - r * 0.29, str(year))
    # Foil sheen
    c.setFillColor(Color(1, 1, 1, alpha=0.07))
    c.ellipse(cx - r * 0.7, cy + r * 0.1, cx + r * 0.1, cy + r * 0.75, stroke=0, fill=1)


def _qr(c: canvas.Canvas, x: float, y: float, size: float, payload: str) -> None:
    widget = qr.QrCodeWidget(payload, barLevel="M")
    widget.barFillColor = GREEN_DARK
    x0, y0, x1, y1 = widget.getBounds()
    d = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    d.add(widget)
    c.setFillColor(PAPER)
    c.rect(x - 3, y - 3, size + 6, size + 6, stroke=0, fill=1)
    renderPDF.draw(d, c, x, y)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.rect(x - 3, y - 3, size + 6, size + 6, stroke=1, fill=0)


def _microtext_line(c: canvas.Canvas, x0: float, x1: float, y: float) -> None:
    c.saveState()
    clip = c.beginPath()
    clip.rect(x0, y - 1, x1 - x0, 4)
    c.clipPath(clip, stroke=0, fill=0)
    c.setFillColor(GOLD_DEEP)
    c.setFont("Helvetica", 2.6)
    c.drawString(x0, y, "MYLE COMMUNITY · TRAINING & CERTIFICATION BOARD · " * 30)
    c.restoreState()


# ── certificate ───────────────────────────────────────────────────────────────


def draw_certificate(
    c: canvas.Canvas,
    *,
    name: str,
    fbo_id: str | None,
    completion_date: datetime,
    test_score: int,
    test_total: int,
    cert_no: str,
) -> None:
    f = _fonts()
    w, h = landscape(A4)
    cx = w / 2
    _paper(c, w, h, f["display"])
    _border(c, w, h)

    # Serial number in red, like official stationery
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(64, h - 68, f"Sl. No. {cert_no}")

    # Emblem + header
    _emblem(c, cx, h - 98, f["display"], completion_date.year)
    _spaced(c, ORG_NAME, cx, h - 166, f["display"], 30, 3.5, bold=0.7, color=GREEN)
    _ribbon(c, cx, h - 188, "TRAINING & CERTIFICATION BOARD", "Helvetica-Bold", 7.5)
    _spaced(c, "CERTIFICATE OF COMPLETION", cx, h - 228, f["display"], 21, 2.5, bold=0.45, color=GOLD_DEEP)
    _rule(c, cx, h - 240, 170)

    # Recipient
    c.setFillColor(MUTED)
    c.setFont("Times-Italic", 14)
    c.drawCentredString(cx, h - 266, "This is to certify that")

    name_size = _fit_size(name, f["serif"], 38, 22, w - 260)
    c.setFillColor(GREEN_DARK)
    c.setFont(f["serif"], name_size)
    c.drawCentredString(cx, h - 304, name)
    half = max(200, stringWidth(name, f["serif"], name_size) / 2 + 26)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.9)
    c.line(cx - half, h - 315, cx + half, h - 315)
    c.setFillColor(GOLD)
    _diamond(c, cx - half, h - 315, 2.5)
    _diamond(c, cx + half, h - 315, 2.5)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(cx, h - 329, f"FBO ID: {fbo_id or 'N/A'}")

    percent = int(round(100 * test_score / test_total)) if test_total else 0
    body = (
        f"has successfully completed the {PROGRAMME} conducted by Myle Community "
        f"and has qualified the final assessment with a score of {percent}% "
        f"({test_score} out of {test_total})."
    )
    c.setFillColor(INK)
    c.setFont(f["serif"], 14)
    y = h - 354
    for line in _wrap(body, f["serif"], 14, w - 320):
        c.drawCentredString(cx, y, line)
        y -= 19

    issued = completion_date.strftime("%d %B %Y")
    _qr(c, w - 64 - 46, h - 72 - 46, 46,
        f"MYLE COMMUNITY | Certificate of Completion | No. {cert_no} | {name} | "
        f"FBO ID {fbo_id or 'N/A'} | {PROGRAMME} | Score {percent}% | Issued {issued}")

    # Details strip: certificate no · date of issue
    strip_y = y - 20
    col_w = 200
    left = cx - col_w
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(left, strip_y + 26, left + col_w * 2, strip_y + 26)
    c.line(left, strip_y - 12, left + col_w * 2, strip_y - 12)
    c.line(cx, strip_y - 8, cx, strip_y + 22)
    for i, (label, value) in enumerate((("CERTIFICATE NO.", cert_no), ("DATE OF ISSUE", issued))):
        x = left + col_w * i + col_w / 2
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x, strip_y + 12, label)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawCentredString(x, strip_y - 2, value)

    # Signatures either side, official seal in the middle
    base = 92
    for (sig_name, sig_title), sx in zip(SIGNATORIES, (190, w - 190)):
        _signature(c, sx, base + 10, sig_name, signature_font(f, sig_name))
        c.setStrokeColor(INK)
        c.setLineWidth(0.7)
        c.line(sx - 100, base - 4, sx + 100, base - 4)
        c.setFillColor(INK)
        c.setFont(f["serif"], 12)
        c.drawCentredString(sx, base - 17, sig_name)
        c.setFillColor(MUTED)
        c.setFont(f["serif"], 9.5)
        c.drawCentredString(sx, base - 29, sig_title)
    _official_seal(c, cx, base + 20, 42, completion_date.year, f["display"])

    # Microtext security line + footer
    _microtext_line(c, 60, w - 60, 51)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6)
    c.drawCentredString(
        cx, 57, f"This is a computer-generated certificate issued by Myle Community. Certificate No. {cert_no}."
    )


async def generate_certificate_pdf(
    *,
    name: str,
    fbo_id: str | None,
    completion_date: datetime,
    test_score: int,
    test_total: int,
    cert_no: str,
) -> bytes:
    """Render the certificate and return the PDF bytes."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A4))
    c.setTitle(f"Certificate of Completion — {name}")
    c.setAuthor("MYLE Community")
    c.setSubject(PROGRAMME)
    draw_certificate(
        c,
        name=name,
        fbo_id=fbo_id,
        completion_date=completion_date,
        test_score=test_score,
        test_total=test_total,
        cert_no=cert_no,
    )
    c.showPage()
    c.save()
    return buffer.getvalue()
