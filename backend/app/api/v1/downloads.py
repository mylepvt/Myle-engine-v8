"""Downloads — admin uploads documents, team/leader downloads them."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.config import settings
from app.models.download import Download

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".png", ".jpg", ".jpeg", ".mp4", ".zip"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class DownloadItem(BaseModel):
    id: int
    title: str
    filename: str
    file_size: int
    mime_type: str
    description: str | None
    created_at: str


def _downloads_dir() -> Path:
    p = Path(settings.upload_dir).expanduser().resolve() / "downloads"
    p.mkdir(parents=True, exist_ok=True)
    return p


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
    rows = result.scalars().all()
    return [
        DownloadItem(
            id=r.id,
            title=r.title,
            filename=r.filename,
            file_size=r.file_size,
            mime_type=r.mime_type,
            description=r.description,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


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
    dest = _downloads_dir() / safe_name
    dest.write_bytes(content)

    mime = _guess_mime(file.filename)
    row = Download(
        title=title.strip(),
        filename=file.filename,
        file_path=str(dest),
        file_size=len(content),
        mime_type=mime,
        description=description.strip() or None,
        uploaded_by=user.user_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return DownloadItem(
        id=row.id,
        title=row.title,
        filename=row.filename,
        file_size=row.file_size,
        mime_type=row.mime_type,
        description=row.description,
        created_at=row.created_at.isoformat(),
    )


@router.get("/{download_id}/file")
async def serve_download_file(
    download_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    row = await db.get(Download, download_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found.")

    path = Path(row.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing from disk.")

    return FileResponse(
        path=str(path),
        filename=row.filename,
        media_type=row.mime_type,
    )


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

    path = Path(row.file_path)
    if path.exists():
        path.unlink()

    await db.delete(row)
    await db.commit()
