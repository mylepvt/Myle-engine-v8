"""Downloads — admin uploads documents, team/leader downloads them.

The Render container disk is wiped on every deploy, so files are never kept
there: Cloudflare R2 when configured (``file_path`` = ``r2:<key>``), otherwise
the bytes go into Postgres (``file_path`` = ``db:``, ``Download.content``).
Rows with any other ``file_path`` are legacy disk uploads.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import quote
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.orm import undefer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.download import Download
from app.services.media_covers import cache_drop, cache_get, cache_put, render_cover
from app.services.r2_storage import delete_from_r2, presign_get_url, r2_enabled, upload_to_r2

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".png", ".jpg", ".jpeg", ".mp4", ".zip"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
_R2_PREFIX = "r2:"
_DB_PATH = "db:"


class DownloadItem(BaseModel):
    id: int
    title: str
    filename: str
    file_size: int
    mime_type: str
    description: str | None
    created_at: str
    # False when the stored file is gone (old disk uploads wiped by a deploy).
    available: bool = True


def _r2_key(row: Download) -> str | None:
    return row.file_path[len(_R2_PREFIX):] if row.file_path.startswith(_R2_PREFIX) else None


def _is_available(row: Download) -> bool:
    return row.file_path == _DB_PATH or _r2_key(row) is not None or Path(row.file_path).exists()


def _to_item(row: Download) -> DownloadItem:
    return DownloadItem(
        id=row.id,
        title=row.title,
        filename=row.filename,
        file_size=row.file_size,
        mime_type=row.mime_type,
        description=row.description,
        created_at=row.created_at.isoformat(),
        available=_is_available(row),
    )


def _guess_mime(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    m = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mp4": "video/mp4",
        ".zip": "application/zip",
    }
    return m.get(ext, "application/octet-stream")


@router.get("", response_model=list[DownloadItem])
async def list_downloads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DownloadItem]:
    result = await db.execute(
        select(Download).order_by(desc(Download.created_at))
    )
    return [_to_item(r) for r in result.scalars().all()]


@router.post("", response_model=DownloadItem, status_code=201)
async def upload_download(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(default=""),
) -> DownloadItem:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can upload documents.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    mime = _guess_mime(file.filename)
    if r2_enabled():
        key = f"downloads/{safe_name}"
        await upload_to_r2(data=content, key=key, content_type=mime)
        stored_path = f"{_R2_PREFIX}{key}"
    else:
        stored_path = _DB_PATH

    row = Download(
        title=title.strip(),
        filename=file.filename,
        file_path=stored_path,
        file_size=len(content),
        mime_type=mime,
        description=description.strip() or None,
        uploaded_by=user.user_id,
        content=content if stored_path == _DB_PATH else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_item(row)


@router.get("/{download_id}/file", response_model=None)
async def serve_download_file(
    download_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse | RedirectResponse | Response:
    row = await db.get(Download, download_id, options=[undefer(Download.content)])
    if not row:
        raise HTTPException(status_code=404, detail="File not found.")

    if row.file_path == _DB_PATH:
        if row.content is None:
            raise HTTPException(status_code=404, detail="File not found.")
        disposition = f"attachment; filename*=UTF-8''{quote(row.filename)}"
        return Response(
            content=row.content,
            media_type=row.mime_type,
            headers={"Content-Disposition": disposition},
        )

    key = _r2_key(row)
    if key is not None:
        url = await presign_get_url(key=key, expires_seconds=300, download_name=row.filename)
        return RedirectResponse(url=url, status_code=302)

    path = Path(row.file_path)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="This file is no longer on the server. Ask admin to upload it again.",
        )

    return FileResponse(
        path=str(path),
        filename=row.filename,
        media_type=row.mime_type,
    )


_COVER_HEADERS = {"Cache-Control": "private, max-age=86400"}


async def _file_bytes(row: Download) -> bytes | None:
    """The stored file's bytes wherever it lives (Postgres, R2 or legacy disk), or None."""
    if row.file_path == _DB_PATH:
        return row.content
    key = _r2_key(row)
    if key is not None:
        url = await presign_get_url(key=key, expires_seconds=120)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url)
        except httpx.HTTPError:
            return None
        return res.content if res.status_code == 200 else None
    path = Path(row.file_path)
    return path.read_bytes() if path.exists() else None


@router.get("/{download_id}/cover", response_model=None)
async def download_cover(
    download_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Small JPEG cover: a PDF's first page or a resized image. 404 for other file types."""
    _ = user
    cache_key = f"dl:{download_id}"
    hit, cover = cache_get(cache_key)
    if not hit:
        row = await db.get(Download, download_id, options=[undefer(Download.content)])
        if not row:
            raise HTTPException(status_code=404, detail="File not found.")
        data = await _file_bytes(row)
        cover = await run_in_threadpool(render_cover, data, row.mime_type, row.filename) if data else None
        cache_put(cache_key, cover)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover for this file.")
    return Response(content=cover, media_type="image/jpeg", headers=_COVER_HEADERS)


@router.delete("/{download_id}", status_code=204)
async def delete_download(
    download_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete documents.")

    row = await db.get(Download, download_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found.")

    key = _r2_key(row)
    if key is not None:
        await delete_from_r2(key)
    elif row.file_path != _DB_PATH:
        path = Path(row.file_path)
        if path.exists():
            path.unlink()

    await db.delete(row)
    await db.commit()
    cache_drop(f"dl:{download_id}")
