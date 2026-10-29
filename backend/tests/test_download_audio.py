"""Library audio: audio files upload through Downloads and stream with byte ranges."""
from __future__ import annotations

from app.api.v1 import downloads as downloads_api

AUDIO = bytes(range(256)) * 40  # 10 240 bytes of stand-in audio


async def _upload(client, name: str, data: bytes):
    return await client.post(
        "/api/v1/downloads",
        data={"title": f"Talk {name}"},
        files={"file": (name, data, "application/octet-stream")},
    )


async def test_audio_upload_and_ranges(admin_client, monkeypatch):
    monkeypatch.setattr(downloads_api, "r2_enabled", lambda: False)
    r = await _upload(admin_client, "mindset.mp3", AUDIO)
    assert r.status_code == 201
    item = r.json()
    assert item["mime_type"] == "audio/mpeg"
    url = f"/api/v1/downloads/{item['id']}/file"

    full = await admin_client.get(url)
    assert full.status_code == 200 and full.content == AUDIO
    assert full.headers["accept-ranges"] == "bytes"

    part = await admin_client.get(url, headers={"Range": "bytes=100-199"})
    assert part.status_code == 206
    assert part.content == AUDIO[100:200]
    assert part.headers["content-range"] == f"bytes 100-199/{len(AUDIO)}"

    tail = await admin_client.get(url, headers={"Range": "bytes=-50"})
    assert tail.status_code == 206 and tail.content == AUDIO[-50:]

    open_end = await admin_client.get(url, headers={"Range": "bytes=10000-"})
    assert open_end.status_code == 206 and open_end.content == AUDIO[10000:]

    # Unsatisfiable or malformed ranges fall back to the whole file.
    bad = await admin_client.get(url, headers={"Range": "bytes=999999-"})
    assert bad.status_code == 200 and bad.content == AUDIO


async def test_other_audio_types_and_rejects(admin_client, monkeypatch):
    monkeypatch.setattr(downloads_api, "r2_enabled", lambda: False)
    for name, mime in (("a.m4a", "audio/mp4"), ("a.aac", "audio/aac"), ("a.wav", "audio/wav"), ("a.ogg", "audio/ogg")):
        r = await _upload(admin_client, name, b"x")
        assert r.status_code == 201 and r.json()["mime_type"] == mime
    assert (await _upload(admin_client, "evil.exe", b"x")).status_code == 400
