"""Sale-invoice image storage.

Stores the FOREVER Tax Invoice image a team member uploads for a Day 3 / Day 6
billing and returns the URL used as ``LeadSale.proof_url``.

Storage backend: Cloudflare R2 when configured (persists across deploys);
otherwise the bytes are persisted in the database (also durable). The local disk
on Render is EPHEMERAL — files vanish on every redeploy / spin-down — so we never
rely on it for durable storage. ``sale_invoice_disk_path`` remains only as a read
fallback for any legacy files already on disk.
"""

from __future__ import annotations

from pathlib import Path
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix
from app.services.db_media_storage import save_db_media
from app.services.r2_storage import r2_enabled, upload_to_r2

_MAX_BYTES = 8 * 1024 * 1024  # invoices can be denser than payment screenshots

_IMAGE_CONTENT_TYPE = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def sale_invoice_disk_path(filename: str) -> Path:
    return _root() / "sale_invoices" / Path(filename).name


async def save_sale_invoice_bytes(
    *, session: AsyncSession, data: bytes, lead_id: int
) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 8 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    filename = f"sale_{lead_id}_{uuid.uuid4().hex[:12]}{sfx}"
    content_type = _IMAGE_CONTENT_TYPE.get(sfx, "application/octet-stream")
    key = f"sale-invoices/{filename}"

    # Prefer R2 (durable) so invoices survive redeploys; otherwise persist in the
    # DB (disk is ephemeral on Render).
    if r2_enabled():
        url = await upload_to_r2(data=data, key=key, content_type=content_type)
        return True, url

    await save_db_media(session, key=key, data=data, content_type=content_type)
    return True, f"/api/v1/media/{key}"
