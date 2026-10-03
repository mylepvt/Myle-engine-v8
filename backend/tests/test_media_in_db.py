"""Uploads survive a wiped disk: bytes live in Postgres and /api/v1/media serves them."""
from __future__ import annotations

import io

import pytest
from fastapi import UploadFile
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import get_db
from app.core.config import settings
from app.db.base import Base
from app.services import (
    enrollment_proof_storage,
    payment_proof_storage,
    sale_invoice_storage,
    training_certificate_storage,
)
from app.services.training_uploads import save_training_notes_image

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
async def ctx(monkeypatch, tmp_path):
    from main import app

    # Simulate production: no R2, and an empty disk (as after a redeploy).
    for mod in (payment_proof_storage, sale_invoice_storage, enrollment_proof_storage, training_certificate_storage):
        monkeypatch.setattr(mod, "r2_enabled", lambda: False)
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "wiped"))

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with Session() as s:
            yield s

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session
    app.dependency_overrides = saved
    await engine.dispose()


@pytest.mark.parametrize(
    "save",
    [
        lambda s: payment_proof_storage.save_payment_proof_bytes(session=s, data=PNG, lead_id=1),
        lambda s: sale_invoice_storage.save_sale_invoice_bytes(session=s, data=PNG, lead_id=1),
        lambda s: enrollment_proof_storage.save_enrollment_proof_bytes(session=s, data=PNG, lead_id=1),
        lambda s: training_certificate_storage.save_training_certificate_bytes(session=s, data=PNG, user_id=1),
    ],
)
async def test_proofs_invoices_certificates_are_served_from_db(ctx, save):
    client, Session = ctx
    async with Session() as s:
        ok, url = await save(s)
        await s.commit()
    assert ok and url.startswith("/api/v1/media/")

    r = await client.get(url)
    assert r.status_code == 200
    assert r.content == PNG
    assert r.headers["content-type"] == "image/png"


async def test_training_notes_replace_previous_upload(ctx):
    client, Session = ctx
    async with Session() as s:
        first = await save_training_notes_image(
            s, 7, 2, UploadFile(file=io.BytesIO(b"old"), filename="a.png", headers={"content-type": "image/png"})
        )
        await s.commit()
    async with Session() as s:
        second = await save_training_notes_image(
            s, 7, 2, UploadFile(file=io.BytesIO(b"new"), filename="b.jpg", headers={"content-type": "image/jpeg"})
        )
        await s.commit()
    assert (await client.get(second)).content == b"new"
    assert (await client.get(first)).status_code == 404  # old extension replaced


async def test_unknown_or_traversal_names_404(ctx):
    client, _Session = ctx
    assert (await client.get("/api/v1/media/payment-proofs/nope.png")).status_code == 404
    assert (await client.get("/api/v1/media/payment-proofs/..%2Fsecret")).status_code == 404
