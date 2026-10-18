"""Notice board voice notices: upload, streaming, play tracking, listeners, replies, push."""
from __future__ import annotations

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.announcement import Announcement
from app.models.announcement_play import AnnouncementPlay
from app.models.announcement_reply import AnnouncementReply
from app.models.media_blob import MediaBlob
from app.models.user import User

BASE = "/api/v1/other/notice-board"
AUDIO = b"\x1aE\xdf\xa3" + bytes(range(256)) * 4  # webm magic + 1 KiB payload


async def _reset(engine) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        for model in (AnnouncementPlay, AnnouncementReply, Announcement, MediaBlob):
            await s.execute(delete(model))
        await s.execute(delete(User).where(User.id.in_([201, 202, 203, 204, 205])))
        s.add_all(
            [
                User(id=201, fbo_id="T00201", email="t201@test.myle", role="team", name="Asha Team"),
                User(id=202, fbo_id="T00202", email="l202@test.myle", role="leader", name="Ravi Leader"),
                User(id=203, fbo_id="T00203", email="a203@test.myle", role="admin", name="Admin"),
                User(id=204, fbo_id="T00204", email="t204@test.myle", role="team", name="Neha Team"),
                # Blocked members are not part of the audience.
                User(id=205, fbo_id="T00205", email="t205@test.myle", role="team", name="Blocked", access_blocked=True),
            ]
        )
        await s.commit()


@pytest.fixture
def pushes(monkeypatch):
    sent: list[dict] = []

    async def fake_push(_factory, **kw):
        sent.append(kw)

    import app.api.v1.notice_board_voice as voice
    import app.api.v1.other_pages as other

    monkeypatch.setattr(voice, "notify_notice_audience_bg", fake_push)
    monkeypatch.setattr(other, "notify_notice_audience_bg", fake_push)
    return sent


async def _audience(engine) -> int:
    """Audience size; other test modules share this DB, so count rather than assume."""
    from app.services.notice_board import audience_count

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        return await audience_count(s)


async def _post_voice(client, **form):
    return await client.post(
        f"{BASE}/voice",
        files={"file": ("voice.webm", AUDIO, "audio/webm;codecs=opus")},
        data={"message": "", "pin": "false", "duration_sec": "75", **form},
    )


@pytest.mark.asyncio
async def test_admin_posts_voice_notice_and_everyone_is_notified(engine, admin_client, pushes):
    await _reset(engine)
    r = await _post_voice(admin_client, message="Big update today")
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["audio_url"] == f"{BASE}/{item['id']}/audio"
    assert item["audio_duration_sec"] == 75
    assert item["message"] == "Big update today"
    assert item["played_count"] == 0
    assert item["audience_count"] == await _audience(engine)

    assert pushes == [{"title": "New voice notice", "body": "Big update today"}]


@pytest.mark.asyncio
async def test_push_reaches_whole_audience_including_trainees(engine, monkeypatch):
    await _reset(engine)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        trainee = await s.get(User, 204)
        trainee.training_required = True
        trainee.training_status = "pending"
        await s.commit()

    captured: dict = {}

    async def fake_send(_session, user_ids, **kw):
        captured["ids"] = set(user_ids)
        captured.update(kw)
        return len(user_ids)

    import app.services.notice_board as nb

    monkeypatch.setattr(nb, "send_push_to_user_ids", fake_send)
    await nb.notify_notice_audience_bg(factory, title="New voice notice", body="Tap to listen (1:15)")

    assert {201, 202, 204} <= captured["ids"]  # trainee 204 included
    assert not ({203, 205} & captured["ids"])  # admin and blocked excluded
    assert captured["url"] == "/dashboard/other/notice-board"


@pytest.mark.asyncio
async def test_text_notice_also_sends_push(engine, admin_client, pushes):
    await _reset(engine)
    r = await admin_client.post(BASE, json={"message": "Meeting at 2 PM", "pin": False})
    assert r.status_code == 201
    assert pushes[0]["title"] == "New notice"
    assert pushes[0]["body"] == "Meeting at 2 PM"


@pytest.mark.asyncio
async def test_team_cannot_post_voice(engine, team_client, pushes):
    await _reset(engine)
    r = await _post_voice(team_client)
    assert r.status_code == 403
    assert pushes == []


@pytest.mark.asyncio
async def test_rejects_non_audio_upload(engine, admin_client, pushes):
    await _reset(engine)
    r = await admin_client.post(
        f"{BASE}/voice",
        files={"file": ("x.png", b"\x89PNG", "image/png")},
        data={"message": ""},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_audio_streams_with_range_requests(engine, admin_client, pushes):
    await _reset(engine)
    aid = (await _post_voice(admin_client)).json()["id"]

    full = await admin_client.get(f"{BASE}/{aid}/audio")
    assert full.status_code == 200
    assert full.content == AUDIO
    assert full.headers["accept-ranges"] == "bytes"
    assert full.headers["content-type"].startswith("audio/webm")

    part = await admin_client.get(f"{BASE}/{aid}/audio", headers={"Range": "bytes=0-1"})
    assert part.status_code == 206
    assert part.content == AUDIO[:2]
    assert part.headers["content-range"] == f"bytes 0-1/{len(AUDIO)}"

    tail = await admin_client.get(f"{BASE}/{aid}/audio", headers={"Range": "bytes=-4"})
    assert tail.status_code == 206
    assert tail.content == AUDIO[-4:]

    bad = await admin_client.get(f"{BASE}/{aid}/audio", headers={"Range": f"bytes={len(AUDIO)}-"})
    assert bad.status_code == 416


@pytest.mark.asyncio
async def test_play_tracking_and_listener_report(engine, admin_client, pushes):
    await _reset(engine)
    aid = (await _post_voice(admin_client)).json()["id"]

    from main import app
    from app.api.deps import require_auth_user
    from tests.conftest import _auth_override

    # Member 201 plays twice and listens to the end; 202 starts but doesn't finish; 204 never plays.
    saved = app.dependency_overrides[require_auth_user]
    try:
        app.dependency_overrides[require_auth_user] = _auth_override("team", 201)
        assert (await admin_client.post(f"{BASE}/{aid}/played", json={"completed": False})).status_code == 204
        assert (await admin_client.post(f"{BASE}/{aid}/played", json={"completed": False})).status_code == 204
        assert (await admin_client.post(f"{BASE}/{aid}/played", json={"completed": True})).status_code == 204
        mine = (await admin_client.get(BASE)).json()["items"][0]
        assert mine["played_by_me"] is True
        assert mine["played_count"] is None  # members don't see the admin stats

        app.dependency_overrides[require_auth_user] = _auth_override("leader", 202)
        assert (await admin_client.post(f"{BASE}/{aid}/played", json={"completed": False})).status_code == 204
        assert (await admin_client.get(f"{BASE}/{aid}/listeners")).status_code == 403
    finally:
        app.dependency_overrides[require_auth_user] = saved

    item = (await admin_client.get(BASE)).json()["items"][0]
    assert item["played_count"] == 2
    audience = await _audience(engine)
    assert item["audience_count"] == audience

    report = (await admin_client.get(f"{BASE}/{aid}/listeners")).json()
    assert report["audience_count"] == audience
    played = {r["user_id"]: r for r in report["played"]}
    assert set(played) == {201, 202}
    assert played[201]["play_count"] == 2
    assert played[201]["completed"] is True
    assert played[202]["completed"] is False
    not_played_ids = {r["user_id"] for r in report["not_played"]}
    assert 204 in not_played_ids
    # Admins and blocked members are never in the audience.
    assert not ({203, 205} & (not_played_ids | set(played)))
    assert len(report["played"]) + len(report["not_played"]) == audience


@pytest.mark.asyncio
async def test_admin_plays_are_not_counted(engine, admin_client, pushes):
    await _reset(engine)
    aid = (await _post_voice(admin_client)).json()["id"]
    assert (await admin_client.post(f"{BASE}/{aid}/played", json={"completed": True})).status_code == 204
    assert (await admin_client.get(BASE)).json()["items"][0]["played_count"] == 0


@pytest.mark.asyncio
async def test_replies_flow(engine, team_client, pushes):
    await _reset(engine)
    from main import app
    from app.api.deps import require_auth_user
    from tests.conftest import _auth_override

    saved = app.dependency_overrides[require_auth_user]
    try:
        app.dependency_overrides[require_auth_user] = _auth_override("admin", 203)
        aid = (await team_client.post(BASE, json={"message": "Questions?", "pin": False})).json()["id"]

        app.dependency_overrides[require_auth_user] = _auth_override("team", 201)
        r = await team_client.post(f"{BASE}/{aid}/replies", json={"body": "  Got it, thanks!  "})
        assert r.status_code == 201
        reply = r.json()
        assert reply["body"] == "Got it, thanks!"
        assert reply["author"] == "Asha Team"
        assert reply["mine"] is True

        assert (await team_client.post(f"{BASE}/{aid}/replies", json={"body": "   "})).status_code == 400

        app.dependency_overrides[require_auth_user] = _auth_override("leader", 202)
        await team_client.post(f"{BASE}/{aid}/replies", json={"body": "Will share with my team"})
        # A leader can't delete someone else's reply.
        assert (await team_client.delete(f"{BASE}/{aid}/replies/{reply['id']}")).status_code == 403

        listing = (await team_client.get(f"{BASE}/{aid}/replies")).json()
        assert [r["author"] for r in listing["items"]] == ["Asha Team", "Ravi Leader"]
        assert [r["can_delete"] for r in listing["items"]] == [False, True]
        assert (await team_client.get(BASE)).json()["items"][0]["reply_count"] == 2

        # Admin moderates.
        app.dependency_overrides[require_auth_user] = _auth_override("admin", 203)
        assert (await team_client.delete(f"{BASE}/{aid}/replies/{reply['id']}")).status_code == 204
        assert (await team_client.get(f"{BASE}/{aid}/replies")).json()["total"] == 1
    finally:
        app.dependency_overrides[require_auth_user] = saved


@pytest.mark.asyncio
async def test_deleting_voice_notice_removes_recording(engine, admin_client, pushes):
    await _reset(engine)
    aid = (await _post_voice(admin_client)).json()["id"]
    assert (await admin_client.delete(f"{BASE}/{aid}")).status_code == 204
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        from sqlalchemy import select

        assert (await s.execute(select(MediaBlob).where(MediaBlob.kind == "notice-audio"))).first() is None
