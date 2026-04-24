from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_UPLOADS_ROOT = _BACKEND_ROOT / "uploads"
_TRAINING_AUDIO_ROOT = _UPLOADS_ROOT / "training_audio"
_TRAINING_NOTES_ROOT = _UPLOADS_ROOT / "training_notes"

_AUDIO_EXTENSIONS = {
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
_IMAGE_EXTENSIONS = {
    ".gif",
    ".heic",
    ".heif",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
}
_CONTENT_TYPE_EXTENSIONS = {
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
}


def normalize_training_audio_url(audio_url: str | None) -> str | None:
    """Normalize persisted audio links so older relative values still resolve in UI."""
    if audio_url is None:
        return None
    raw = audio_url.strip()
    if not raw:
        return None

    lower = raw.lower()
    if lower.startswith(("http://", "https://", "data:", "blob:")):
        return raw
    if raw.startswith("/"):
        return raw
    if raw.startswith("uploads/"):
        return f"/{raw}"
    if raw.startswith("training_audio/"):
        return f"/uploads/{raw}"
    # Legacy monolith stored media as "audio/<file>" under uploads/training/.
    if raw.startswith("audio/") or raw.startswith("pdf/"):
        return f"/uploads/training/{raw}"
    return f"/{raw}"


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


def _looks_like_audio_upload(file: UploadFile) -> bool:
    ext = Path(file.filename or "").suffix.lower()
    if ext in _AUDIO_EXTENSIONS:
        return True
    content_type = (file.content_type or "").lower()
    if content_type.startswith("audio/"):
        return True
    mapped = _CONTENT_TYPE_EXTENSIONS.get(content_type)
    return mapped in _AUDIO_EXTENSIONS


def _looks_like_image_upload(file: UploadFile) -> bool:
    ext = Path(file.filename or "").suffix.lower()
    if ext in _IMAGE_EXTENSIONS:
        return True
    content_type = (file.content_type or "").lower()
    if content_type.startswith("image/"):
        return True
    mapped = _CONTENT_TYPE_EXTENSIONS.get(content_type)
    return mapped in _IMAGE_EXTENSIONS


def _delete_matching_files(root: Path, stem: str) -> None:
    if not root.exists():
        return
    for pattern in (f"{stem}.*", f"{stem}_*"):
        for candidate in root.glob(pattern):
            if candidate.is_file():
                candidate.unlink(missing_ok=True)


def remove_training_audio_file(audio_url: str | None) -> None:
    if not audio_url or not audio_url.startswith("/uploads/training_audio/"):
        return

    relative_path = audio_url.removeprefix("/uploads/")
    target = (_UPLOADS_ROOT / relative_path).resolve()
    try:
        target.relative_to(_TRAINING_AUDIO_ROOT.resolve())
    except ValueError:
        return
    target.unlink(missing_ok=True)


async def save_training_audio_file(day_number: int, file: UploadFile) -> str:
    if not _looks_like_audio_upload(file):
        raise ValueError("Unsupported audio file. Please upload .m4a, .mp3, .wav, .ogg, .aac, or .webm.")

    _TRAINING_AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    stem = f"day_{day_number}"
    _delete_matching_files(_TRAINING_AUDIO_ROOT, stem)

    ext = _pick_extension(
        filename=file.filename,
        content_type=file.content_type,
        allowed=_AUDIO_EXTENSIONS,
        default_ext=".mp3",
    )
    destination = _TRAINING_AUDIO_ROOT / f"{stem}_{uuid4().hex}{ext}"
    destination.write_bytes(await file.read())
    return f"/uploads/training_audio/{destination.name}"


async def save_training_notes_image(user_id: int, day_number: int, file: UploadFile) -> str:
    if not _looks_like_image_upload(file):
        raise ValueError("Unsupported image file. Please upload .jpg, .jpeg, .png, .webp, .heic, .heif, or .gif.")

    _TRAINING_NOTES_ROOT.mkdir(parents=True, exist_ok=True)
    stem = f"{user_id}_{day_number}"
    _delete_matching_files(_TRAINING_NOTES_ROOT, stem)

    ext = _pick_extension(
        filename=file.filename,
        content_type=file.content_type,
        allowed=_IMAGE_EXTENSIONS,
        default_ext=".jpg",
    )
    destination = _TRAINING_NOTES_ROOT / f"{stem}{ext}"
    destination.write_bytes(await file.read())
    return f"/uploads/training_notes/{destination.name}"
