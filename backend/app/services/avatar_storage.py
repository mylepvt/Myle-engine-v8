"""Local avatar files under configured upload dir."""

from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

_MAX_BYTES = 2 * 1024 * 1024

_ALLOWED_SUFFIX = {".jpg", ".jpeg", ".png", ".webp"}


def _root() -> Path:
    return Path(settings.upload_dir).expanduser().resolve()


def avatar_disk_path(user_id: int, suffix: str) -> Path:
    safe = suffix.lower() if suffix in _ALLOWED_SUFFIX else ".jpg"
    return _root() / "avatars" / f"{user_id}{safe}"


def detect_image_suffix(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


async def save_user_avatar_file(*, user_id: int, file: UploadFile) -> tuple[bool, str]:
    data = await file.read()
    if len(data) > _MAX_BYTES:
        return False, "Image too large (max 2 MB)"

    sfx = detect_image_suffix(data)
    if sfx is None:
        return False, "Use JPEG, PNG, or WebP"

    root = _root() / "avatars"
    root.mkdir(parents=True, exist_ok=True)

    uid = str(user_id)
    for p in root.iterdir():
        if p.is_file() and p.stem == uid and p.suffix.lower() in _ALLOWED_SUFFIX:
            try:
                p.unlink()
            except OSError:
                pass

    dest = avatar_disk_path(user_id, sfx)
    dest.write_bytes(data)
    return True, f"/api/v1/media/avatar/{user_id}"
