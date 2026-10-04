"""Training certificate image storage.

Same rules as payment proofs: Cloudflare R2 when configured (durable across
deploys), else the local upload dir. Only real JPEG/PNG/WebP images, max 5 MB.
"""

from __future__ import annotations

from pathlib import Path
import uuid

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.db_media_storage import put_media
from app.services.r2_storage import r2_enabled, upload_to_r2

_MAX_BYTES = 5 * 1024 * 1024

_IMAGE_CONTENT_TYPE = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def training_certificate_disk_path(filename: str) -> Path:
    return _root() / "training_certificates" / Path(filename).name


async def save_training_certificate_bytes(
    *,
    session: AsyncSession,
    data: bytes,
    user_id: int,
) -> tuple[bool, str]:
    if not data:
        return False, "Empty file"
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 5 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    filename = f"cert_{user_id}_{uuid.uuid4().hex[:12]}{sfx}"

    if r2_enabled():
        url = await upload_to_r2(
            data=data,
            key=f"training-certificates/{filename}",
            content_type=_IMAGE_CONTENT_TYPE.get(sfx, "application/octet-stream"),
        )
        return True, url

    # No R2 in production: the container disk is wiped on every deploy, so the
    # bytes go to Postgres (served by /api/v1/media/training-certificates/...).
    await put_media(session, kind="training-certificates", name=filename, data=data)
    return True, f"/api/v1/media/training-certificates/{filename}"
