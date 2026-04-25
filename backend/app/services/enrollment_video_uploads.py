from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.services.enrollment_video import normalize_video_source_url

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_UPLOADS_ROOT = _BACKEND_ROOT / "uploads"
_ENROLLMENT_VIDEO_ROOT = _UPLOADS_ROOT / "enrollment_video"

_MAX_BYTES = 512 * 1024 * 1024
_ALLOWED_EXTENSIONS = {
    ".m4v",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".webm",
}
_CONTENT_TYPE_EXTENSIONS = {
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
}


def _pick_extension(file: UploadFile) -> str | None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix in _ALLOWED_EXTENSIONS:
        return suffix
    mapped = _CONTENT_TYPE_EXTENSIONS.get((file.content_type or "").lower())
    if mapped in _ALLOWED_EXTENSIONS:
        return mapped
    return None


async def save_enrollment_video_file(file: UploadFile) -> tuple[bool, str, str | None]:
    ext = _pick_extension(file)
    if ext is None:
        return False, "Unsupported video file. Use .mp4, .webm, .mov, .m4v, .mpg, or .mpeg.", None

    _ENROLLMENT_VIDEO_ROOT.mkdir(parents=True, exist_ok=True)
    filename = f"enrollment_video_{uuid4().hex}{ext}"
    destination = _ENROLLMENT_VIDEO_ROOT / filename

    total_bytes = 0
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > _MAX_BYTES:
                    handle.close()
                    destination.unlink(missing_ok=True)
                    return False, "Video too large (max 512 MB).", None
                handle.write(chunk)
    finally:
        await file.close()

    return True, "Enrollment video uploaded successfully.", f"/uploads/enrollment_video/{filename}"


def remove_managed_enrollment_video_file(source_url: str | None) -> None:
    raw = normalize_video_source_url(source_url)
    if not raw.startswith("/uploads/enrollment_video/"):
        return

    relative = raw.removeprefix("/uploads/")
    target = (_UPLOADS_ROOT / relative).resolve()
    try:
        target.relative_to(_ENROLLMENT_VIDEO_ROOT.resolve())
    except ValueError:
        return
    target.unlink(missing_ok=True)


def cleanup_replaced_managed_enrollment_video(
    previous_source_url: str | None,
    next_source_url: str | None,
) -> None:
    previous = normalize_video_source_url(previous_source_url)
    current = normalize_video_source_url(next_source_url)
    if previous and previous != current:
        remove_managed_enrollment_video_file(previous)
