"""Cover images for Library tiles: PDF first pages, image previews, YouTube thumbnails.

Covers are small JPEGs made on first request and kept in process memory, so a
deploy simply rebuilds them. YouTube thumbnails are fetched by the server so the
video id (and with it the unlisted link) never reaches members' browsers.
"""

from __future__ import annotations

import io
import re
from collections import OrderedDict

import httpx

COVER_WIDTH = 480
_MAX_ENTRIES = 300
_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YT_HOSTS = ("youtube.com", "youtu.be", "youtube-nocookie.com")

_cache: OrderedDict[str, bytes | None] = OrderedDict()


def cache_get(key: str) -> tuple[bool, bytes | None]:
    """(hit, value) — a cached None means "no cover", so it isn't rebuilt every time."""
    if key not in _cache:
        return False, None
    _cache.move_to_end(key)
    return True, _cache[key]


def cache_put(key: str, value: bytes | None) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _MAX_ENTRIES:
        _cache.popitem(last=False)


def cache_drop(prefix: str) -> None:
    for key in [k for k in _cache if k.startswith(prefix)]:
        del _cache[key]


def youtube_video_id(raw: str | None) -> str | None:
    """The 11-character id of a YouTube link, or None for any other URL (e.g. an R2 .mp4)."""
    if not raw:
        return None
    url = raw.strip()
    if not any(host in url for host in _YT_HOSTS):
        return None
    for marker in ("youtu.be/", "watch?v=", "embed/", "shorts/", "live/"):
        if marker in url:
            candidate = url.split(marker, 1)[1].split("?")[0].split("&")[0].split("/")[0]
            return candidate if _YT_ID.match(candidate) else None
    return None


async def fetch_youtube_thumbnail(video_id: str) -> bytes | None:
    key = f"yt:{video_id}"
    hit, value = cache_get(key)
    if hit:
        return value
    data: bytes | None = None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg")
            if res.status_code == 200 and res.headers.get("content-type", "").startswith("image/"):
                data = res.content
    except httpx.HTTPError:
        return None  # network hiccup: don't cache, try again next time
    cache_put(key, data)
    return data


def _to_jpeg(image) -> bytes:
    from PIL import Image

    image = image.convert("RGB")
    if image.width > COVER_WIDTH:
        height = round(image.height * COVER_WIDTH / image.width)
        image = image.resize((COVER_WIDTH, height), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=80, optimize=True)
    return out.getvalue()


def render_cover(data: bytes, mime_type: str, filename: str) -> bytes | None:
    """First page of a PDF, or a resized image; None for anything else. CPU-bound — run in a thread."""
    name = filename.lower()
    try:
        if mime_type == "application/pdf" or name.endswith(".pdf"):
            import pypdfium2 as pdfium

            pdf = pdfium.PdfDocument(data)
            try:
                if len(pdf) == 0:
                    return None
                page = pdf[0]
                scale = COVER_WIDTH / max(page.get_width(), 1)
                return _to_jpeg(page.render(scale=scale).to_pil())
            finally:
                pdf.close()
        if mime_type.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg")):
            from PIL import Image

            return _to_jpeg(Image.open(io.BytesIO(data)))
    except Exception:  # a broken or encrypted file just has no cover
        return None
    return None
