"""Training certificate upload: only real images, stored durably, servable via /media."""

from __future__ import annotations

import base64

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User

UPLOAD_URL = "/api/v1/system/training/certificate/upload"

_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture
def local_uploads(tmp_path, monkeypatch):
    import app.services.training_certificate_storage as storage

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(storage, "r2_enabled", lambda: False)
    return tmp_path


async def _ensure_user(engine, user_id: int) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        if await s.get(User, user_id) is None:
            s.add(
                User(
                    id=user_id, fbo_id=f"T{user_id:05d}", email=f"team{user_id}@test.myle",
                    role="team", name="Cert Member",
                )
            )
            await s.commit()


async def test_certificate_upload_rejects_non_image(engine, team_client: AsyncClient, local_uploads):
    await _ensure_user(engine, 201)
    r = await team_client.post(
        UPLOAD_URL,
        files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert r.status_code == 400, r.text
    assert not (local_uploads / "training_certificates").exists() or not any(
        (local_uploads / "training_certificates").iterdir()
    )


async def test_certificate_upload_stores_and_serves_image(engine, team_client: AsyncClient, local_uploads):
    await _ensure_user(engine, 201)
    r = await team_client.post(UPLOAD_URL, files={"file": ("cert.png", _PNG, "image/png")})
    assert r.status_code == 200, r.text
    url = r.json()["certificate_url"]
    assert url.startswith("/api/v1/media/training-certificates/cert_201_")
    assert url.endswith(".png")

    served = await team_client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == _PNG

    async with AsyncSession(engine, expire_on_commit=False) as s:
        user = await s.get(User, 201)
        await s.refresh(user)
        assert user.certificate_url == url
        assert user.training_status == "completed"
