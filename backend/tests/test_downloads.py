"""Downloads: R2-backed storage survives deploys; wiped disk files are flagged."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.api.v1 import downloads as downloads_api
from app.db.base import Base
from app.models.download import Download

ADMIN, TEAM = 7501, 7502


@pytest.fixture
async def ctx(monkeypatch, tmp_path):
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with Session() as s:
            yield s

    r2: dict[str, bytes] = {}

    async def fake_upload(*, data: bytes, key: str, content_type: str) -> str:
        r2[key] = data
        return f"https://r2.test/{key}"

    async def fake_presign(*, key: str, expires_seconds: int = 120, download_name: str | None = None) -> str:
        assert key in r2
        return f"https://r2.test/{key}?sig=1&name={download_name}"

    async def fake_delete(key: str) -> None:
        r2.pop(key, None)

    monkeypatch.setattr(downloads_api, "r2_enabled", lambda: True)
    monkeypatch.setattr(downloads_api, "upload_to_r2", fake_upload)
    monkeypatch.setattr(downloads_api, "presign_get_url", fake_presign)
    monkeypatch.setattr(downloads_api, "delete_from_r2", fake_delete)

    who = {"user": AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session, who, r2
    app.dependency_overrides = saved
    await engine.dispose()


async def test_upload_goes_to_r2_and_download_redirects(ctx):
    client, Session, who, r2 = ctx
    r = await client.post(
        "/api/v1/downloads",
        data={"title": "Plan", "description": ""},
        files={"file": ("Business Plan.pdf", b"%PDF-1.4 demo", "application/pdf")},
    )
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["available"] is True
    assert len(r2) == 1

    async with Session() as s:
        row = await s.get(Download, item["id"])
        assert row.file_path.startswith("r2:downloads/")

    who["user"] = AuthUser(user_id=TEAM, role="team", email="t@t.myle")
    r = await client.get(f"/api/v1/downloads/{item['id']}/file", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"].startswith("https://r2.test/downloads/")
    assert "name=Business%20Plan.pdf" in r.headers["location"]

    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")
    assert (await client.delete(f"/api/v1/downloads/{item['id']}")).status_code == 204
    assert r2 == {}


async def test_wiped_disk_file_is_flagged_unavailable(ctx, tmp_path):
    client, Session, _who, _r2 = ctx
    async with Session() as s:
        s.add(Download(title="Old", filename="old.pdf", file_path=str(tmp_path / "gone.pdf"),
                       file_size=10, mime_type="application/pdf", uploaded_by=ADMIN))
        await s.commit()

    items = (await client.get("/api/v1/downloads")).json()
    assert [i["available"] for i in items] == [False]

    r = await client.get(f"/api/v1/downloads/{items[0]['id']}/file")
    assert r.status_code == 404
    assert "upload it again" in r.text
