"""Public media files (avatars + payment proofs).

Files are served from the DB (durable) when present, falling back to any legacy
file still on the local upload dir. New uploads land in the DB whenever R2 is not
configured (see ``db_media_storage``), so these routes keep working across the
ephemeral-disk wipes that happen on every Render redeploy / spin-down.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import get_db
from app.core.config import settings
from app.services.avatar_storage import _ALLOWED_SUFFIX
from app.services.capture_poster_storage import capture_poster_disk_path
from app.services.db_media_storage import load_db_media
from app.services.payment_proof_storage import payment_proof_disk_path
from app.services.sale_invoice_storage import sale_invoice_disk_path

router = APIRouter()


async def _db_media_response(
    session: AsyncSession, *, key: str, cache_control: str
) -> Response | None:
    """Serve media bytes stored in the DB for ``key`` (None if not stored)."""
    hit = await load_db_media(session, key)
    if hit is None:
        return None
    data, content_type = hit
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": cache_control},
    )


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
async def get_payment_proof(
    filename: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Serve uploaded payment proof images (DB-stored, legacy disk fallback)."""
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    cache = "public, max-age=86400"
    path = payment_proof_disk_path(safe_name)
    if path.is_file():
        return FileResponse(
            path=str(path),
            media_type=_guess_media_type(path.suffix),
            headers={"Cache-Control": cache},
        )
    resp = await _db_media_response(
        session, key=f"payment-proofs/{safe_name}", cache_control=cache
    )
    if resp is not None:
        return resp
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("/capture-posters/{filename}", include_in_schema=True)
async def get_capture_poster(
    filename: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Serve member-uploaded capture posters (public — shared with prospects)."""
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    cache = "public, max-age=86400"
    path = capture_poster_disk_path(safe_name)
    if path.is_file():
        return FileResponse(
            path=str(path),
            media_type=_guess_media_type(path.suffix),
            headers={"Cache-Control": cache},
        )
    resp = await _db_media_response(
        session, key=f"capture-posters/{safe_name}", cache_control=cache
    )
    if resp is not None:
        return resp
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("/sale-invoices/{filename}", include_in_schema=True)
async def get_sale_invoice(
    filename: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Serve uploaded CC/sale invoice images (DB-stored, legacy disk fallback)."""
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    cache = "private, no-store"
    path = sale_invoice_disk_path(safe_name)
    if path.is_file():
        return FileResponse(
            path=str(path),
            media_type=_guess_media_type(path.suffix),
            headers={"Cache-Control": cache},
        )
    resp = await _db_media_response(
        session, key=f"sale-invoices/{safe_name}", cache_control=cache
    )
    if resp is not None:
        return resp
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
