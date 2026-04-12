"""Public media files (profile avatars)."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette import status as http_status

from app.core.config import settings
from app.services.avatar_storage import _ALLOWED_SUFFIX

router = APIRouter()


def _guess_media_type(suffix: str) -> str:
    s = suffix.lower()
    if s in (".jpg", ".jpeg"):
        return "image/jpeg"
    if s == ".png":
        return "image/png"
    if s == ".webp":
        return "image/webp"
    return "application/octet-stream"


@router.get("/avatar/{user_id}", include_in_schema=True)
async def get_user_avatar(user_id: int) -> FileResponse:
    """Serve uploaded avatar if present (no auth — same as public profile photo URL)."""
    root = Path(settings.upload_dir).expanduser().resolve() / "avatars"
    if not root.is_dir():
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    for sfx in _ALLOWED_SUFFIX:
        p = root / f"{user_id}{sfx}"
        if p.is_file():
            return FileResponse(
                path=str(p),
                media_type=_guess_media_type(sfx),
                headers={"Cache-Control": "public, max-age=86400"},
            )
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
