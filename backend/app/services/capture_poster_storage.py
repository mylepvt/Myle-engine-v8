"""Local storage for member-uploaded capture posters (under the configured upload dir).

The client composites its own poster image with the QR/link overlay and uploads the
finished PNG/JPEG here; we just persist the bytes and return a served URL.
"""
from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import UploadFile

from app.core.config import settings
from app.services.avatar_storage import detect_image_suffix

_MAX_BYTES = 8 * 1024 * 1024


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def capture_poster_disk_path(filename: str) -> Path:
    return _root() / "capture_posters" / Path(filename).name


def save_capture_poster_bytes(*, data: bytes, link_id: int) -> tuple[bool, str]:
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 8 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    root = _root() / "capture_posters"
    root.mkdir(parents=True, exist_ok=True)

    filename = f"poster_{link_id}_{uuid.uuid4().hex[:12]}{sfx}"
    dest = root / filename
    dest.write_bytes(data)
    return True, f"/api/v1/media/capture-posters/{filename}"


async def save_capture_poster_file(*, link_id: int, file: UploadFile) -> tuple[bool, str]:
    data = await file.read()
    return save_capture_poster_bytes(data=data, link_id=link_id)
