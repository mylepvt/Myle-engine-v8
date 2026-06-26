"""Storage for member-uploaded capture posters (shared publicly with prospects).

The client composites its own poster image with the QR/link overlay and uploads
the finished PNG/JPEG here; we just persist the bytes and return a served URL.

Storage backend: Cloudflare R2 when configured; otherwise the bytes are persisted
in the database (also durable). Render's local disk is EPHEMERAL — files written
there vanish on redeploy / spin-down — so we never rely on it for durable
storage. ``capture_poster_disk_path`` remains only as a read fallback for any
legacy files already on disk.
"""
from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix
from app.services.db_media_storage import save_db_media
from app.services.r2_storage import r2_enabled, upload_to_r2

_MAX_BYTES = 8 * 1024 * 1024

_IMAGE_CONTENT_TYPE = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def capture_poster_disk_path(filename: str) -> Path:
    return _root() / "capture_posters" / Path(filename).name


async def save_capture_poster_bytes(
    *, session: AsyncSession, data: bytes, link_id: int
) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 8 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    filename = f"poster_{link_id}_{uuid.uuid4().hex[:12]}{sfx}"
    content_type = _IMAGE_CONTENT_TYPE.get(sfx, "application/octet-stream")
    key = f"capture-posters/{filename}"

    if r2_enabled():
        url = await upload_to_r2(data=data, key=key, content_type=content_type)
        return True, url

    # No R2: persist in the DB (disk is ephemeral on Render).
    await save_db_media(session, key=key, data=data, content_type=content_type)
    return True, f"/api/v1/media/{key}"


async def save_capture_poster_file(
    *, session: AsyncSession, link_id: int, file: UploadFile
) -> tuple[bool, str]:
    data = await file.read()
    return await save_capture_poster_bytes(session=session, data=data, link_id=link_id)
