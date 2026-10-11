"""Members editing their own profile (Settings → Profile)."""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.user import User

URL = "/api/v1/settings-enhanced/profile"


async def _seed(engine, **overrides) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        for uid in (201, 290):
            existing = await s.get(User, uid)
            if existing is not None:
                await s.delete(existing)
        await s.flush()
        s.add(
            User(
                id=201,
                fbo_id="T00201",
                email="team201@test.myle",
                role="team",
                username="team_201",
                name="Old Name",
                **overrides,
            )
        )
        s.add(
            User(
                id=290,
                fbo_id="T00290",
                email="other290@test.myle",
                role="team",
                username="Taken_Name",
                phone="9000000290",
            )
        )
        await s.commit()


@pytest.mark.asyncio
async def test_member_saves_name_without_a_phone(engine, team_client):
    await _seed(engine)
    r = await team_client.patch(URL, json={"name": "  New Name  ", "phone": ""})
    assert r.status_code == 200, r.text

    profile = (await team_client.get(URL)).json()
    assert profile["name"] == "New Name"
    assert profile["phone"] is None


@pytest.mark.asyncio
async def test_member_cannot_change_admin_only_fields(engine, team_client):
    await _seed(engine, access_blocked=True, training_status="pending")
    r = await team_client.patch(
        URL, json={"name": "Sneaky", "access_blocked": False, "training_status": "completed"}
    )
    assert r.status_code == 403

    profile = (await team_client.get(URL)).json()
    assert profile["access_blocked"] is True
    assert profile["training_status"] == "pending"
    assert profile["name"] == "Old Name"


@pytest.mark.asyncio
async def test_username_rules(engine, team_client):
    await _seed(engine)
    # Taken by someone else, case-insensitively.
    r = await team_client.patch(URL, json={"username": "taken_name"})
    assert r.status_code == 400
    assert "taken" in r.text.lower()

    r = await team_client.patch(URL, json={"username": "bad name!"})
    assert r.status_code == 400

    # A blank username is ignored rather than wiping the login handle.
    r = await team_client.patch(URL, json={"username": "", "name": "Kept"})
    assert r.status_code == 200
    assert (await team_client.get(URL)).json()["username"] == "team_201"


@pytest.mark.asyncio
async def test_duplicate_phone_is_rejected_with_a_clear_message(engine, team_client):
    await _seed(engine)
    r = await team_client.patch(URL, json={"phone": "9000000290"})
    assert r.status_code == 400
    assert "Phone number already registered" in r.text


@pytest.mark.asyncio
async def test_photo_upload_is_saved(engine, team_client):
    await _seed(engine)
    data_url = "data:image/jpeg;base64,/9j/AAAA"
    r = await team_client.post(f"{URL}/avatar", json={"data_url": data_url})
    assert r.status_code == 200
    assert (await team_client.get(URL)).json()["avatar_url"] == data_url
