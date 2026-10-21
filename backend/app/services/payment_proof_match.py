"""Cross-check the prospect's payment screenshot against the one their upline uploaded.

A match is any of:
1. the same file (SHA-256), or
2. the Transaction ID / UTR the member entered can be read (OCR) in the prospect's image, or
3. only when OCR isn't available on this server: the two images look the same
   (difference hash, small distance — survives WhatsApp recompression and resizing).

When OCR runs but doesn't find the Transaction ID, it is a mismatch even if the images look
alike: UPI success screens share one layout, so a look-alike alone isn't proof.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass

from app.services.forever_invoice_ocr import _ocr_image_to_text

# 16×16 difference hash = 256 bits; ≤ this many differing bits counts as the same image.
DHASH_MAX_DISTANCE = 20
# A near-blank image hashes to (almost) all zeros or ones and "matches" anything plain.
DHASH_MIN_DETAIL = 24


@dataclass(frozen=True)
class MatchResult:
    matched: bool
    detail: str


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def dhash_hex(data: bytes, size: int = 16) -> str | None:
    """Difference hash of an image (hex), or None if it can't be decoded."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data)).convert("L").resize((size + 1, size), Image.LANCZOS)
    except Exception:
        return None
    px = list(img.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            left = px[row * (size + 1) + col]
            right = px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f"{bits:0{size * size // 4}x}"


def _detailed(h: str) -> bool:
    ones = bin(int(h, 16)).count("1")
    return DHASH_MIN_DETAIL <= ones <= 256 - DHASH_MIN_DETAIL


def _distance(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _alnum(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def check_match(*, prospect_image: bytes, member_sha256: str | None, member_dhash: str | None, payment_ref: str | None) -> MatchResult:
    if member_sha256 and sha256_bytes(prospect_image) == member_sha256:
        return MatchResult(True, "Same screenshot as the one uploaded by the upline.")

    ocr_ok, text = _ocr_image_to_text(prospect_image)
    ref = _alnum(payment_ref or "")
    if ocr_ok:
        if ref and ref in _alnum(text):
            return MatchResult(True, f"Transaction ID {payment_ref} found on the prospect's screenshot.")
        return MatchResult(False, f"Transaction ID {payment_ref or '—'} not found on the prospect's screenshot.")

    pd = dhash_hex(prospect_image)
    if pd and member_dhash and _detailed(pd) and _detailed(member_dhash) and _distance(pd, member_dhash) <= DHASH_MAX_DISTANCE:
        return MatchResult(True, "The prospect's screenshot looks the same as the upline's.")
    return MatchResult(False, "The prospect's screenshot doesn't look like the one uploaded by the upline.")
