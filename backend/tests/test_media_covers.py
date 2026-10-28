"""Library covers: PDF first page, image preview, server-side YouTube thumbnails."""
from __future__ import annotations

import io

from PIL import Image
from reportlab.pdfgen import canvas

from app.api.v1 import skill_training as skill_api
from app.api.v1 import system as system_api
from app.models.download import Download
from app.services import media_covers
from app.services.media_covers import render_cover, youtube_video_id


def _pdf_bytes() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(595, 842))
    c.drawString(72, 760, "Invitation script")
    c.save()
    return buf.getvalue()


def _png_bytes(width: int = 1200, height: int = 800) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (120, 90, 200)).save(buf, format="PNG")
    return buf.getvalue()


def test_youtube_video_id_only_for_youtube_links():
    assert youtube_video_id("https://youtu.be/dQw4w9WgXcQ?si=x") == "dQw4w9WgXcQ"
    assert youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") == "dQw4w9WgXcQ"
    assert youtube_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert youtube_video_id("https://pub-x.r2.dev/videos/day1.mp4") is None
    assert youtube_video_id("https://www.youtube.com/watch?v=bad") is None
    assert youtube_video_id(None) is None


def test_render_cover_pdf_image_and_other():
    pdf_cover = Image.open(io.BytesIO(render_cover(_pdf_bytes(), "application/pdf", "script.pdf")))
    assert pdf_cover.format == "JPEG" and pdf_cover.width == media_covers.COVER_WIDTH
    img_cover = Image.open(io.BytesIO(render_cover(_png_bytes(), "image/png", "poster.png")))
    assert img_cover.width == media_covers.COVER_WIDTH
    assert render_cover(b"PK\x03\x04", "application/zip", "pack.zip") is None
    assert render_cover(b"not a pdf", "application/pdf", "broken.pdf") is None


async def test_download_cover_endpoint(team_client, engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        pdf = Download(title="Script", filename="script.pdf", file_path="db:", file_size=1,
                       mime_type="application/pdf", uploaded_by=1, content=_pdf_bytes())
        zipf = Download(title="Pack", filename="pack.zip", file_path="db:", file_size=1,
                        mime_type="application/zip", uploaded_by=1, content=b"PK")
        s.add_all([pdf, zipf])
        await s.commit()
        pdf_id, zip_id = pdf.id, zipf.id

    r = await team_client.get(f"/api/v1/downloads/{pdf_id}/cover")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert (await team_client.get(f"/api/v1/downloads/{zip_id}/cover")).status_code == 404
    assert (await team_client.get("/api/v1/downloads/999999/cover")).status_code == 404


async def test_training_day_thumbnail_proxied(team_client, engine, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.training_video import TrainingVideo

    seen: list[str] = []

    async def fake_fetch(video_id: str) -> bytes:
        seen.append(video_id)
        return b"\xff\xd8jpeg"

    monkeypatch.setattr(system_api, "fetch_youtube_thumbnail", fake_fetch)
    monkeypatch.setattr(skill_api, "fetch_youtube_thumbnail", fake_fetch)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add(TrainingVideo(day_number=91, title="Day 91", youtube_url="https://youtu.be/dQw4w9WgXcQ"))
        s.add(TrainingVideo(day_number=92, title="Day 92", youtube_url="https://pub-x.r2.dev/day92.mp4"))
        await s.commit()

    r = await team_client.get("/api/v1/system/training/day/91/thumbnail")
    assert r.status_code == 200 and r.content == b"\xff\xd8jpeg"
    assert seen == ["dQw4w9WgXcQ"]
    assert (await team_client.get("/api/v1/system/training/day/92/thumbnail")).status_code == 404
