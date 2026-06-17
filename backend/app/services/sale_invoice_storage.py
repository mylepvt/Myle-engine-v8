"""Local sale-invoice image files under the configured upload dir.

Mirrors ``payment_proof_storage`` — stores the FOREVER Tax Invoice image a team
member uploads for a Day 3 / Day 6 billing, and returns the media URL used as
``LeadSale.proof_url``.
"""

from __future__ import annotations

from pathlib import Path
import uuid

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix

_MAX_BYTES = 8 * 1024 * 1024  # invoices can be denser than payment screenshots


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def sale_invoice_disk_path(filename: str) -> Path:
    return _root() / "sale_invoices" / Path(filename).name


def save_sale_invoice_bytes(*, data: bytes, lead_id: int) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 8 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    root = _root() / "sale_invoices"
    root.mkdir(parents=True, exist_ok=True)

    filename = f"sale_{lead_id}_{uuid.uuid4().hex[:12]}{sfx}"
    dest = root / filename
    dest.write_bytes(data)
    return True, f"/api/v1/media/sale-invoices/{filename}"
