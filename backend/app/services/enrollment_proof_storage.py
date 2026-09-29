"""Enrollment payment screenshot storage (₹149–200 proof before Day 1).

Cloudflare R2 when configured (durable across deploys), else the local upload
dir. Only real JPEG/PNG/WebP images, max 5 MB.
"""

from __future__ import annotations

from pathlib import Path
import uuid

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix
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


def enrollment_proof_disk_path(filename: str) -> Path:
    return _root() / "enrollment_proofs" / Path(filename).name


async def save_enrollment_proof_bytes(*, data: bytes, lead_id: int) -> tuple[bool, str]:
    if not data:
        return False, "Empty file"
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 5 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Upload a screenshot image (JPEG, PNG, or WebP)"

    filename = f"enroll_{lead_id}_{uuid.uuid4().hex[:12]}{sfx}"

    if r2_enabled():
        url = await upload_to_r2(
            data=data,
            key=f"enrollment-proofs/{filename}",
            content_type=_IMAGE_CONTENT_TYPE.get(sfx, "application/octet-stream"),
        )
        return True, url

    root = _root() / "enrollment_proofs"
    root.mkdir(parents=True, exist_ok=True)
    (root / filename).write_bytes(data)
    return True, f"/api/v1/media/enrollment-proofs/{filename}"
