from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_UPLOADS_ROOT = _BACKEND_ROOT / "uploads"
_BATCH_NOTES_ROOT = _UPLOADS_ROOT / "batch_day_notes"
_BATCH_VOICE_ROOT = _UPLOADS_ROOT / "batch_day_voice"
_BATCH_VIDEO_ROOT = _UPLOADS_ROOT / "batch_day_video"

_IMAGE_DOCUMENT_EXTENSIONS = {
    ".gif",
    ".heic",
    ".heif",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".webp",
}
_VOICE_EXTENSIONS = {
    ".aac",
    ".m4a",
    ".mp3",
    ".mpeg",
    ".mpga",
    ".oga",
    ".ogg",
    ".wav",
    ".webm",
}
_VIDEO_EXTENSIONS = {
    ".avi",
    ".m4v",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".webm",
}
_CONTENT_TYPE_EXTENSIONS = {
    "application/pdf": ".pdf",
    "audio/aac": ".aac",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-m4a": ".m4a",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
    "video/x-msvideo": ".avi",
}


def _pick_extension(
    *,
    filename: str | None,
    content_type: str | None,
    allowed: set[str],
    default_ext: str,
) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in allowed:
        return ext

    mapped = _CONTENT_TYPE_EXTENSIONS.get((content_type or "").lower())
    if mapped in allowed:
        return mapped

    return default_ext


def _delete_matching_files(root: Path, stem: str) -> None:
    if not root.exists():
        return
    for candidate in root.glob(f"{stem}.*"):
        if candidate.is_file():
            candidate.unlink(missing_ok=True)


async def _save_submission_file(
    *,
    root: Path,
    folder_name: str,
    stem: str,
    file: UploadFile,
    allowed_extensions: set[str],
    default_ext: str,
) -> str:
    root.mkdir(parents=True, exist_ok=True)
    _delete_matching_files(root, stem)

    ext = _pick_extension(
        filename=file.filename,
        content_type=file.content_type,
        allowed=allowed_extensions,
        default_ext=default_ext,
    )
    destination = root / f"{stem}{ext}"
    destination.write_bytes(await file.read())
    return f"/uploads/{folder_name}/{destination.name}"


async def save_batch_submission_notes_file(lead_id: int, slot: str, file: UploadFile) -> str:
    return await _save_submission_file(
        root=_BATCH_NOTES_ROOT,
        folder_name="batch_day_notes",
        stem=f"{lead_id}_{slot}",
        file=file,
        allowed_extensions=_IMAGE_DOCUMENT_EXTENSIONS,
        default_ext=".jpg",
    )


async def save_batch_submission_voice_file(lead_id: int, slot: str, file: UploadFile) -> str:
    return await _save_submission_file(
        root=_BATCH_VOICE_ROOT,
        folder_name="batch_day_voice",
        stem=f"{lead_id}_{slot}",
        file=file,
        allowed_extensions=_VOICE_EXTENSIONS,
        default_ext=".m4a",
    )


async def save_batch_submission_video_file(lead_id: int, slot: str, file: UploadFile) -> str:
    return await _save_submission_file(
        root=_BATCH_VIDEO_ROOT,
        folder_name="batch_day_video",
        stem=f"{lead_id}_{slot}",
        file=file,
        allowed_extensions=_VIDEO_EXTENSIONS,
        default_ext=".mp4",
    )
