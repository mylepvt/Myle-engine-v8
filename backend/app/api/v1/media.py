"""Uploaded media files.

Served from Postgres (media_blobs) first — the container disk is wiped on every
deploy — then from the legacy disk path for files that still exist there.
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
from app.services.enrollment_proof_storage import enrollment_proof_disk_path
from app.services.payment_proof_storage import payment_proof_disk_path
from app.services.sale_invoice_storage import sale_invoice_disk_path
from app.services.db_media_storage import get_media
from app.services.training_certificate_storage import training_certificate_disk_path

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


DbSession = Annotated[AsyncSession, Depends(get_db)]


def _safe(filename: str) -> str:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    return safe_name


async def _serve(
    session: AsyncSession, *, kind: str, filename: str, disk_path: Path | None, cache: str
) -> Response:
    name = _safe(filename)
    blob = await get_media(session, kind=kind, name=name)
    if blob is not None:
        return Response(content=blob.data, media_type=blob.content_type, headers={"Cache-Control": cache})
    if disk_path is not None and disk_path.is_file():
        return FileResponse(path=str(disk_path), media_type=_guess_media_type(disk_path.suffix), headers={"Cache-Control": cache})
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")


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
async def get_payment_proof(filename: str, session: DbSession) -> Response:
    """Serve uploaded payment proof images."""
    return await _serve(session, kind="payment-proofs", filename=filename,
                        disk_path=payment_proof_disk_path(_safe(filename)), cache="public, max-age=86400")


@router.get("/enrollment-proofs/{filename}", include_in_schema=True)
async def get_enrollment_proof(filename: str, session: DbSession) -> Response:
    """Serve uploaded enrollment payment screenshots."""
    return await _serve(session, kind="enrollment-proofs", filename=filename,
                        disk_path=enrollment_proof_disk_path(_safe(filename)), cache="private, no-store")


@router.get("/capture-posters/{filename}", include_in_schema=True)
async def get_capture_poster(filename: str, session: DbSession) -> Response:
    """Serve member-uploaded capture posters (public — shared with prospects)."""
    return await _serve(session, kind="capture-posters", filename=filename,
                        disk_path=capture_poster_disk_path(_safe(filename)), cache="public, max-age=86400")


@router.get("/sale-invoices/{filename}", include_in_schema=True)
async def get_sale_invoice(filename: str, session: DbSession) -> Response:
    """Serve uploaded CC/sale invoice images."""
    return await _serve(session, kind="sale-invoices", filename=filename,
                        disk_path=sale_invoice_disk_path(_safe(filename)), cache="private, no-store")


@router.get("/training-certificates/{filename}", include_in_schema=True)
async def get_training_certificate(filename: str, session: DbSession) -> Response:
    """Serve uploaded training certificate images."""
    return await _serve(session, kind="training-certificates", filename=filename,
                        disk_path=training_certificate_disk_path(_safe(filename)), cache="private, no-store")


@router.get("/training-notes/{filename}", include_in_schema=True)
async def get_training_notes(filename: str, session: DbSession) -> Response:
    """Serve members' training-day notes photos."""
    return await _serve(session, kind="training-notes", filename=filename, disk_path=None, cache="private, no-store")


@router.get("/training-audio/{filename}", include_in_schema=True)
async def get_training_audio(filename: str, session: DbSession) -> Response:
    """Serve admin-uploaded training audio."""
    return await _serve(session, kind="training-audio", filename=filename, disk_path=None, cache="public, max-age=86400")
