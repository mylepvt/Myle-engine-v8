"""Local payment proof files under the configured upload dir."""

from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import UploadFile

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix

_MAX_BYTES = 5 * 1024 * 1024


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def payment_proof_disk_path(filename: str) -> Path:
    return _root() / "payment_proofs" / Path(filename).name


def save_payment_proof_bytes(
    *,
    data: bytes,
    lead_id: int,
) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 5 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    root = _root() / "payment_proofs"
    root.mkdir(parents=True, exist_ok=True)

    filename = f"proof_{lead_id}_{uuid.uuid4().hex[:12]}{sfx}"
    dest = root / filename
    dest.write_bytes(data)
    return True, f"/api/v1/media/payment-proofs/{filename}"


async def save_payment_proof_file(
    *,
    lead_id: int,
    file: UploadFile,
) -> tuple[bool, str]:
    data = await file.read()
    return save_payment_proof_bytes(data=data, lead_id=lead_id)
