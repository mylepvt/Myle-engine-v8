"""Public certificate verification (QR target): genuine passes, forged/edited fails."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User
from app.services.certificate_verify import verification_code, verify_url

UID = 7401


@pytest.fixture
async def certified_member(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        await s.execute(delete(TrainingTestAttempt).where(TrainingTestAttempt.user_id == UID))
        u = await s.get(User, UID)
        if u is None:
            u = User(id=UID, fbo_id="910123456789", email="verify7401@test.myle", role="team")
            s.add(u)
        u.name = "Priya Verma"
        u.training_status = "completed"
        s.add(TrainingTestAttempt(user_id=UID, score=9, total_questions=10, passed=True,
                                  attempted_at=datetime(2026, 10, 5, 5, 0, tzinfo=timezone.utc)))
        await s.commit()
    return f"MYLE/TRN/2026/{UID:05d}"


def test_verify_url_shape():
    url = verify_url("http://new-myle-community.onrender.com/", "MYLE/TRN/2026/00003")
    assert url.startswith("https://new-myle-community.onrender.com/verify?no=MYLE%2FTRN%2F2026%2F00003&c=")
    assert verify_url("http://127.0.0.1:8800", "MYLE/TRN/2026/00003").startswith("http://127.0.0.1:8800/")
    code = verification_code("MYLE/TRN/2026/00003")
    assert len(code) == 9 and code[4] == "-"
    assert code != verification_code("MYLE/TRN/2026/00004")


async def test_genuine_certificate_verifies(anon_client: AsyncClient, certified_member: str):
    no = certified_member
    r = await anon_client.get("/api/public/certificates/verify", params={"no": no, "c": verification_code(no)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["valid"] is True
    cert = body["certificate"]
    assert cert["name"] == "Priya Verma"
    assert cert["issued_on"] == "05 October 2026"
    assert cert["score"] == "9/10"
    assert cert["fbo_id"] == "91••••••••89"
    # code is case/format tolerant (typed by hand)
    typed = verification_code(no).lower().replace("-", "")
    r = await anon_client.get("/api/public/certificates/verify", params={"no": no.lower(), "c": typed})
    assert r.json()["valid"] is True


async def test_wrong_code_or_edited_number_is_rejected(anon_client: AsyncClient, certified_member: str):
    no = certified_member
    r = await anon_client.get("/api/public/certificates/verify", params={"no": no, "c": "AAAA-AAAA"})
    assert r.json() == {"valid": False, "certificate": None}
    edited = no.replace("2026", "2025")
    r = await anon_client.get("/api/public/certificates/verify", params={"no": edited, "c": verification_code(no)})
    assert r.json()["valid"] is False


async def test_member_without_passed_test_is_not_valid(anon_client: AsyncClient, engine, certified_member: str):
    async with AsyncSession(engine) as s:
        await s.execute(delete(TrainingTestAttempt).where(TrainingTestAttempt.user_id == UID))
        await s.commit()
    no = certified_member
    r = await anon_client.get("/api/public/certificates/verify", params={"no": no, "c": verification_code(no)})
    assert r.json()["valid"] is False
