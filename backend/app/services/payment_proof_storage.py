"""Payment proof image storage.

Cloudflare R2 when configured (durable across deploys), else the local upload
dir. Render's local disk is EPHEMERAL — files vanish on redeploy — so production
must have R2 configured or proof images 404 after the next deploy.
"""

from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import UploadFile

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


def payment_proof_disk_path(filename: str) -> Path:
    return _root() / "payment_proofs" / Path(filename).name


async def save_payment_proof_bytes(
    *,
    data: bytes,
    lead_id: int,
) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 5 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    filename = f"proof_{lead_id}_{uuid.uuid4().hex[:12]}{sfx}"

    if r2_enabled():
        url = await upload_to_r2(
            data=data,
            key=f"payment-proofs/{filename}",
            content_type=_IMAGE_CONTENT_TYPE.get(sfx, "application/octet-stream"),
        )
        return True, url

    root = _root() / "payment_proofs"
    root.mkdir(parents=True, exist_ok=True)
    (root / filename).write_bytes(data)
    return True, f"/api/v1/media/payment-proofs/{filename}"


async def save_payment_proof_file(
    *,
    lead_id: int,
    file: UploadFile,
) -> tuple[bool, str]:
    data = await file.read()
    return await save_payment_proof_bytes(data=data, lead_id=lead_id)
