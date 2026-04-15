"""Public media files (avatars + payment proofs)."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette import status as http_status

from app.core.config import settings
from app.services.avatar_storage import _ALLOWED_SUFFIX
from app.services.payment_proof_storage import payment_proof_disk_path

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
                headers={"Cache-Control": "private, no-store"},
            )
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("/payment-proofs/{filename}", include_in_schema=True)
async def get_payment_proof(filename: str) -> FileResponse:
    """Serve uploaded payment proof images."""
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    path = payment_proof_disk_path(safe_name)
    if not path.is_file():
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    return FileResponse(
        path=str(path),
        media_type=_guess_media_type(path.suffix),
        headers={"Cache-Control": "public, max-age=86400"},
    )
