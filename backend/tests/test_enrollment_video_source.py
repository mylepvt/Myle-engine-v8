"""One enrollment video: Settings "Enrollment Video" wins, old Enrollment-Live keys are fallback."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.db.base import Base
from app.models.app_setting import AppSetting
from app.services import enrollment_video as ev
from app.services.flp_min_billing_video import get_flp_min_billing_video_source


async def _session_with(settings: dict[str, str]):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([AppSetting(key=k, value=v) for k, v in settings.items()])
        await s.commit()
    return engine, Session


async def test_new_enrollment_video_setting_wins():
    engine, Session = await _session_with({
        "enrollment_video_source_url": "videos/enrollment/master.mp4",
        "flp_min_billing_video_source_url": "https://old.example/enroll.mp4",
    })
    async with Session() as s:
        assert await get_flp_min_billing_video_source(s) == "videos/enrollment/master.mp4"
    await engine.dispose()


async def test_falls_back_to_old_enrollment_live_setting():
    engine, Session = await _session_with({"flp_min_billing_video_source_url": "https://old.example/enroll.mp4"})
    async with Session() as s:
        assert await get_flp_min_billing_video_source(s) == "https://old.example/enroll.mp4"
    await engine.dispose()


async def test_r2_keys_are_presigned_other_sources_are_not(monkeypatch):
    async def fake_presign(*, key: str, expires_seconds: int) -> str:
        return f"https://signed.example/{key}?ttl={expires_seconds}"

    monkeypatch.setattr(ev.r2_storage, "r2_enabled", lambda: True)
    monkeypatch.setattr(ev.r2_storage, "presign_get_url", fake_presign)
    assert await ev.presigned_r2_upstream("videos/enrollment/master.mp4") == (
        "https://signed.example/videos/enrollment/master.mp4?ttl=120"
    )
    assert await ev.presigned_r2_upstream("/uploads/local.mp4") is None
    assert await ev.presigned_r2_upstream("https://youtu.be/abc") is None

    monkeypatch.setattr(ev.r2_storage, "r2_enabled", lambda: False)
    assert await ev.presigned_r2_upstream("videos/enrollment/master.mp4") is None
