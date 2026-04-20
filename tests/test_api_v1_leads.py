from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.crm_outbox import CrmOutbox
from app.models.lead import Lead
from app.models.follow_up import FollowUp
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def test_list_leads_requires_auth() -> None:
    res = client.get("/api/v1/leads")
    assert res.status_code == 401


def test_lead_pool_requires_auth() -> None:
    res = client.get("/api/v1/lead-pool")
    assert res.status_code == 401
    assert res.headers.get("X-Request-ID")
    body = res.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"] == "Authentication required"
    assert body["error"]["request_id"] == res.headers.get("X-Request-ID")


def test_list_leads_empty_when_authenticated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)

    c = TestClient(app)
    login = c.post("/api/v1/auth/dev-login", json={"role": "leader"})
    assert login.status_code == 200

    res = c.get("/api/v1/leads")
    assert res.status_code == 200
    assert res.json() == {
        "items": [],
        "total": 0,
        "limit": 50,
        "offset": 0,
    }
    assert res.headers.get("X-Request-ID")


async def _seed_one_lead(
    *,
    user_id: int,
    name: str = "Acme Corp",
    lead_status: str = "new",
    archived_at: datetime | None = None,
    deleted_at: datetime | None = None,
    in_pool: bool = False,
    pool_price_cents: int | None = None,
    created_by_user_id: int | None = None,
    assigned_to_user_id: int | None = None,
) -> None:
    fac = test_conftest.get_test_session_factory()
    cb = created_by_user_id if created_by_user_id is not None else user_id
    at = assigned_to_user_id if assigned_to_user_id is not None else user_id
    async with fac() as session:
        session.add(
            Lead(
                name=name,
                status=lead_status,
                created_by_user_id=cb,
                assigned_to_user_id=at,
                archived_at=archived_at,
                deleted_at=deleted_at,
                in_pool=in_pool,
                pool_price_cents=pool_price_cents,
            )
        )
        await session.commit()


async def _clear_leads() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(BatchShareLink))
        await session.execute(delete(AppSetting))
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(Lead))
        await session.commit()


def _authed_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_list_leads_returns_db_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200

        res = c.get("/api/v1/leads")
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["limit"] == 50
        assert body["offset"] == 0
        assert len(body["items"]) == 1
        assert body["items"][0]["name"] == "Acme Corp"
        assert body["items"][0]["status"] == "new"
        assert body["items"][0]["created_by_user_id"] == 2
        assert "id" in body["items"][0]
        assert "created_at" in body["items"][0]
    finally:
        asyncio.run(_clear_leads())


def test_leader_does_not_see_other_users_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="Admin lead"))
    asyncio.run(_seed_one_lead(user_id=2, name="Leader lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/leads")
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Leader lead"
    finally:
        asyncio.run(_clear_leads())


def test_slice1_team_list_only_creator_not_assignee(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Slice 1 (sequence): vl2 ``GET /leads`` uses ``lead_visibility_where`` → team = creator.

    Legacy Flask ``/leads`` filters team rows by assignee/stale_worker (``lead_routes.py``) — different.
    This test locks current vl2 list semantics until parity work explicitly changes them.
    """
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Leader created for team",
            created_by_user_id=2,
            assigned_to_user_id=3,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.get("/api/v1/leads")
        assert res.status_code == 200
        assert res.json()["total"] == 0
    finally:
        asyncio.run(_clear_leads())


def test_slice1_leader_does_not_see_downline_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Leader should NOT see leads created by downline team members — only own leads."""
    asyncio.run(_seed_one_lead(user_id=3, name="From downline team"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/leads")
        assert res.status_code == 200
        body = res.json()
        # Lead was created by team user (id=3), not leader → leader must not see it.
        assert body["total"] == 0
    finally:
        asyncio.run(_clear_leads())


def test_admin_sees_all_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="A"))
    asyncio.run(_seed_one_lead(user_id=2, name="B"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.get("/api/v1/leads")
        assert res.status_code == 200
        assert res.json()["total"] == 2
    finally:
        asyncio.run(_clear_leads())


def test_create_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        res = c.post("/api/v1/leads", json={"name": "  New Co  "})
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "New Co"
        assert body["status"] == "new"
        assert body["created_by_user_id"] == 3
        listed = c.get("/api/v1/leads").json()
        assert listed["total"] == 1
        assert listed["items"][0]["name"] == "New Co"
    finally:
        asyncio.run(_clear_leads())


def test_leader_cannot_patch_others_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="Owned by admin user"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.patch("/api/v1/leads/1", json={"name": "Hacked"})
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "forbidden"
    finally:
        asyncio.run(_clear_leads())


def test_delete_lead_returns_204(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="To delete"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.delete("/api/v1/leads/1")
        assert res.status_code == 204
        assert res.content == b""
        listed = c.get("/api/v1/leads").json()
        assert listed["total"] == 0
        again = c.delete("/api/v1/leads/1")
        assert again.status_code == 404
    finally:
        asyncio.run(_clear_leads())


def test_slice4_deleted_only_list_uses_execution_scope_for_non_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Leader deleted assigned to team",
            deleted_at=datetime.now(timezone.utc),
            created_by_user_id=2,
            assigned_to_user_id=3,
        )
    )
    asyncio.run(
        _seed_one_lead(
            user_id=3,
            name="Team deleted assigned to leader",
            deleted_at=datetime.now(timezone.utc),
            created_by_user_id=3,
            assigned_to_user_id=2,
        )
    )
    try:
        team = _authed_client(monkeypatch)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        team_body = team.get("/api/v1/leads", params={"deleted_only": "true"}).json()
        assert team_body["total"] == 1
        assert team_body["items"][0]["name"] == "Leader deleted assigned to team"

        leader = _authed_client(monkeypatch)
        assert leader.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        leader_body = leader.get("/api/v1/leads", params={"deleted_only": "true"}).json()
        assert leader_body["total"] == 1
        assert leader_body["items"][0]["name"] == "Team deleted assigned to leader"

        admin = _authed_client(monkeypatch)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        admin_body = admin.get("/api/v1/leads", params={"deleted_only": "true"}).json()
        assert admin_body["total"] == 2
    finally:
        asyncio.run(_clear_leads())


def test_admin_restore_soft_deleted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Back",
            deleted_at=datetime.now(timezone.utc),
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        rs = c.patch("/api/v1/leads/1", json={"restored": True})
        assert rs.status_code == 200
        assert rs.json()["deleted_at"] is None
        assert c.get("/api/v1/leads").json()["total"] == 1
    finally:
        asyncio.run(_clear_leads())


def test_slice4_team_can_restore_assigned_deleted_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Assigned to team in recycle",
            deleted_at=datetime.now(timezone.utc),
            created_by_user_id=2,
            assigned_to_user_id=3,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        rs = c.patch("/api/v1/leads/1", json={"restored": True})
        assert rs.status_code == 200
        assert rs.json()["deleted_at"] is None
    finally:
        asyncio.run(_clear_leads())


def test_slice4_team_cannot_restore_unassigned_deleted_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=3,
            name="Team deleted but assigned to leader",
            deleted_at=datetime.now(timezone.utc),
            created_by_user_id=3,
            assigned_to_user_id=2,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        rs = c.patch("/api/v1/leads/1", json={"restored": True})
        assert rs.status_code == 403
    finally:
        asyncio.run(_clear_leads())


def test_slice4_permanent_delete_admin_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="To hard delete",
            deleted_at=datetime.now(timezone.utc),
        )
    )
    try:
        team = _authed_client(monkeypatch)
        assert team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        assert team.delete("/api/v1/leads/1/permanent-delete").status_code == 403

        admin = _authed_client(monkeypatch)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        assert admin.delete("/api/v1/leads/1/permanent-delete").status_code == 204
        assert admin.get("/api/v1/leads", params={"deleted_only": "true"}).json()["total"] == 0
        assert admin.get("/api/v1/leads/1").status_code == 404
    finally:
        asyncio.run(_clear_leads())


def test_slice4_permanent_delete_requires_deleted_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="Active lead"))
    try:
        admin = _authed_client(monkeypatch)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = admin.delete("/api/v1/leads/1/permanent-delete")
        assert res.status_code == 400
    finally:
        asyncio.run(_clear_leads())


def test_slice4_permanent_delete_cleans_followups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Deleted with followup",
            deleted_at=datetime.now(timezone.utc),
        )
    )
    fac = test_conftest.get_test_session_factory()

    async def _seed_followup() -> None:
        async with fac() as session:
            session.add(FollowUp(lead_id=1, note="cleanup me", created_by_user_id=2))
            await session.commit()

    async def _followup_count() -> int:
        async with fac() as session:
            row = await session.execute(select(func.count()).select_from(FollowUp))
            return int(row.scalar_one())

    asyncio.run(_seed_followup())
    try:
        admin = _authed_client(monkeypatch)
        assert admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        assert asyncio.run(_followup_count()) == 1
        assert admin.delete("/api/v1/leads/1/permanent-delete").status_code == 204
        assert asyncio.run(_followup_count()) == 0
    finally:
        asyncio.run(_clear_leads())


def test_admin_release_to_pool_hides_from_main_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="Pool me"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        assert c.get("/api/v1/leads").json()["total"] == 1
        p = c.patch("/api/v1/leads/1", json={"in_pool": True})
        assert p.status_code == 200
        assert p.json()["in_pool"] is True
        assert c.get("/api/v1/leads").json()["total"] == 0
        pool = c.get("/api/v1/lead-pool").json()
        assert pool["total"] == 1
        assert pool["items"][0]["name"] == "Pool me"
    finally:
        asyncio.run(_clear_leads())


def test_claim_lead_from_pool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="Claimable", in_pool=True))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        cl = c.post("/api/v1/leads/1/claim")
        assert cl.status_code == 200
        body = cl.json()
        assert body["in_pool"] is False
        assert body["created_by_user_id"] == 3
        assert c.get("/api/v1/lead-pool").json()["total"] == 0
        mine = c.get("/api/v1/leads").json()
        assert mine["total"] == 1
        assert mine["items"][0]["name"] == "Claimable"
    finally:
        asyncio.run(_clear_leads())


def test_slice5_admin_cannot_claim_pool_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="Admin should not claim", in_pool=True))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        claim = c.post("/api/v1/leads/1/claim")
        assert claim.status_code == 403
    finally:
        asyncio.run(_clear_leads())


def test_slice5_claim_requires_sufficient_wallet_balance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Team dev user has zero balance by default in tests.
    asyncio.run(
        _seed_one_lead(
            user_id=1,
            name="Paid claim",
            in_pool=True,
            pool_price_cents=5_000,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        claim = c.post("/api/v1/leads/1/claim")
        assert claim.status_code == 402
        # Lead should remain in pool when claim fails.
        lead = c.get("/api/v1/lead-pool").json()
        assert lead["total"] == 1
        assert lead["items"][0]["in_pool"] is True
    finally:
        asyncio.run(_clear_leads())


def test_slice5_cannot_reclaim_already_claimed_lead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=1, name="One-time claim", in_pool=True))
    try:
        first = _authed_client(monkeypatch)
        assert first.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        assert first.post("/api/v1/leads/1/claim").status_code == 200

        second = _authed_client(monkeypatch)
        assert second.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        retry = second.post("/api/v1/leads/1/claim")
        assert retry.status_code == 400
    finally:
        asyncio.run(_clear_leads())


def test_batch_share_url_returns_tokenized_watch_links(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="BatchLead",
            lead_status="day1",
            assigned_to_user_id=2,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.post("/api/v1/leads/1/batch-share-url", json={"slot": "d1_morning"})
        assert res.status_code == 200
        body = res.json()
        assert "/api/v1/watch/batch/d1_morning/1?token=" in body["watch_url_v1"]
        assert "/api/v1/watch/batch/d1_morning/2?token=" in body["watch_url_v2"]
    finally:
        asyncio.run(_clear_leads())


def test_batch_share_url_d2_forbidden_for_leader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Day2Lead",
            lead_status="day2",
            assigned_to_user_id=2,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.post("/api/v1/leads/1/batch-share-url", json={"slot": "d2_morning"})
        assert res.status_code == 403
    finally:
        asyncio.run(_clear_leads())


def test_watch_batch_token_marks_slot_done_after_completion_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="WatchLead",
            lead_status="day1",
            assigned_to_user_id=2,
        )
    )
    fac = test_conftest.get_test_session_factory()

    async def _seed_video_setting() -> None:
        async with fac() as session:
            session.add(
                AppSetting(
                    key="batch_d1_morning_v1",
                    value="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                )
            )
            await session.commit()

    async def _lead_after() -> Lead | None:
        async with fac() as session:
            return await session.get(Lead, 1)

    asyncio.run(_seed_video_setting())
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        share = c.post("/api/v1/leads/1/batch-share-url", json={"slot": "d1_morning"})
        token = share.json()["watch_url_v1"].split("token=")[-1]

        watch = c.get(f"/api/v1/watch/batch/d1_morning/1?token={token}", follow_redirects=False)
        assert watch.status_code == 200
        assert "Watch complete hone par auto mark ho jayega." in watch.text
        assert "youtube.com/iframe_api" in watch.text

        pre = asyncio.run(_lead_after())
        assert pre is not None
        assert pre.d1_morning is False

        done = c.post("/api/v1/watch/batch/complete", json={"token": token, "slot": "d1_morning"})
        assert done.status_code == 200
        assert done.json()["ok"] is True

        lead = asyncio.run(_lead_after())
        assert lead is not None
        assert lead.d1_morning is True
    finally:
        asyncio.run(_clear_leads())


def test_archived_and_deleted_only_mutually_exclusive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    res = c.get(
        "/api/v1/leads",
        params={"archived_only": "true", "deleted_only": "true"},
    )
    assert res.status_code == 422


def test_list_leads_filter_by_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="A", lead_status="new_lead"))
    asyncio.run(_seed_one_lead(user_id=2, name="B", lead_status="converted"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/leads", params={"status": "converted"})
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "B"
        assert body["items"][0]["status"] == "converted"
    finally:
        asyncio.run(_clear_leads())


def test_list_leads_search_by_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="Acme Industries"))
    asyncio.run(_seed_one_lead(user_id=2, name="Other LLC"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/leads", params={"q": "acme"})
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Acme Industries"
    finally:
        asyncio.run(_clear_leads())


def test_list_leads_invalid_status_query_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    res = c.get("/api/v1/leads", params={"status": "nope"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "unprocessable_entity"


def test_patch_lead_status_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="X", lead_status="new"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.patch("/api/v1/leads/1", json={"status": "contacted"})
        assert res.status_code == 200
        assert res.json()["name"] == "X"
        assert res.json()["status"] == "contacted"
    finally:
        asyncio.run(_clear_leads())


def test_default_list_hides_archived_leads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Gone",
            archived_at=datetime.now(timezone.utc),
        )
    )
    asyncio.run(_seed_one_lead(user_id=2, name="Here"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        body = c.get("/api/v1/leads").json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Here"
        assert body["items"][0]["archived_at"] is None
    finally:
        asyncio.run(_clear_leads())


def test_archived_only_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Old",
            archived_at=datetime.now(timezone.utc),
        )
    )
    asyncio.run(_seed_one_lead(user_id=2, name="Active"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        body = c.get("/api/v1/leads", params={"archived_only": "true"}).json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Old"
        assert body["items"][0]["archived_at"] is not None
    finally:
        asyncio.run(_clear_leads())


def test_slice4_archived_team_sees_assigned_not_creator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy `/old-leads` scope is assignee-based for non-admin users."""
    asyncio.run(
        _seed_one_lead(
            user_id=2,
            name="Leader created, team assigned, archived",
            archived_at=datetime.now(timezone.utc),
            created_by_user_id=2,
            assigned_to_user_id=3,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        body = c.get("/api/v1/leads", params={"archived_only": "true"}).json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Leader created, team assigned, archived"
    finally:
        asyncio.run(_clear_leads())


def test_slice4_archived_team_hides_unassigned_self_created(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(
        _seed_one_lead(
            user_id=3,
            name="Team created but leader assigned, archived",
            archived_at=datetime.now(timezone.utc),
            created_by_user_id=3,
            assigned_to_user_id=2,
        )
    )
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        body = c.get("/api/v1/leads", params={"archived_only": "true"}).json()
        assert body["total"] == 0
    finally:
        asyncio.run(_clear_leads())


def test_patch_archive_then_restore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_seed_one_lead(user_id=2, name="Z"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        ar = c.patch("/api/v1/leads/1", json={"archived": True})
        assert ar.status_code == 200
        assert ar.json()["archived_at"] is not None
        assert c.get("/api/v1/leads").json()["total"] == 0
        rs = c.patch("/api/v1/leads/1", json={"archived": False})
        assert rs.status_code == 200
        assert rs.json()["archived_at"] is None
        assert c.get("/api/v1/leads").json()["total"] == 1
    finally:
        asyncio.run(_clear_leads())


def test_api_flow_create_then_workboard_then_status_then_archive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end API parity with manual UI: create → workboard → status → archive."""
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        cr = c.post(
            "/api/v1/leads",
            json={"name": "Karanveer Singh Flow", "status": "new_lead"},
        )
        assert cr.status_code == 201
        lid = cr.json()["id"]

        wb0 = c.get("/api/v1/workboard").json()
        new_col = next(col for col in wb0["columns"] if col["status"] == "new_lead")
        assert new_col["total"] >= 1
        assert any(i["name"] == "Karanveer Singh Flow" for i in new_col["items"])

        assert (
            c.patch(f"/api/v1/leads/{lid}", json={"status": "contacted"}).status_code == 200
        )
        wb1 = c.get("/api/v1/workboard").json()
        contacted = next(col for col in wb1["columns"] if col["status"] == "contacted")
        assert any(i["name"] == "Karanveer Singh Flow" for i in contacted["items"])

        assert c.patch(f"/api/v1/leads/{lid}", json={"archived": True}).status_code == 200
        assert c.get("/api/v1/leads").json()["total"] == 0
        arch = c.get("/api/v1/leads", params={"archived_only": "true"}).json()
        assert arch["total"] == 1
        assert arch["items"][0]["name"] == "Karanveer Singh Flow"
    finally:
        asyncio.run(_clear_leads())


def test_lead_pool_defaults_get_ok_for_authenticated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/lead-pool/defaults")
    assert r.status_code == 200
    assert r.json() == {"default_pool_price_cents": 0}


def test_lead_pool_defaults_put_forbidden_for_non_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.put("/api/v1/lead-pool/defaults", json={"default_pool_price_cents": 500_00})
    assert r.status_code == 403


def test_lead_pool_defaults_put_admin_persists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    c = _authed_client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    r = c.put("/api/v1/lead-pool/defaults", json={"default_pool_price_cents": 25_000})
    assert r.status_code == 200
    assert r.json()["default_pool_price_cents"] == 25_000
    assert c.get("/api/v1/lead-pool/defaults").json()["default_pool_price_cents"] == 25_000
    assert c.put("/api/v1/lead-pool/defaults", json={"default_pool_price_cents": 0}).status_code == 200


def test_team_cannot_patch_day1_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_one_lead(user_id=3, name="Team Owned", lead_status="day1"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
        assert c.patch("/api/v1/leads/1", json={"d1_morning": True}).status_code == 403
        assert c.patch("/api/v1/leads/1", json={"day1_completed": True}).status_code == 403
        ok = c.patch("/api/v1/leads/1", json={"d2_morning": True})
        assert ok.status_code == 200
        assert ok.json()["d2_morning"] is True
    finally:
        asyncio.run(_clear_leads())


def test_leader_can_patch_day1_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_one_lead(user_id=2, name="Leader Lead", lead_status="day1"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        r = c.patch(
            "/api/v1/leads/1",
            json={"d1_morning": True, "d1_afternoon": True, "d1_evening": True},
        )
        assert r.status_code == 200
        b = r.json()
        assert b["d1_morning"] is True
        assert b["day1_completed_at"] is not None
    finally:
        asyncio.run(_clear_leads())


def test_all_leads_response_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_one_lead(user_id=2, name="Today Lead", lead_status="new_lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        res = c.get("/api/v1/leads/all")
        assert res.status_code == 200
        body = res.json()
        assert "today_items" in body
        assert "history_items" in body
        assert "today_total" in body
        assert "history_total" in body
        assert body["total"] == body["today_total"] + body["history_total"]
    finally:
        asyncio.run(_clear_leads())


def test_all_leads_filters_status_and_query(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_clear_leads())
    asyncio.run(_seed_one_lead(user_id=2, name="Alpha Deal", lead_status="converted"))
    asyncio.run(_seed_one_lead(user_id=2, name="Beta Deal", lead_status="new_lead"))
    try:
        c = _authed_client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
        by_status = c.get("/api/v1/leads/all", params={"status": "converted"})
        assert by_status.status_code == 200
        items = by_status.json()["today_items"] + by_status.json()["history_items"]
        assert len(items) == 1
        assert items[0]["name"] == "Alpha Deal"

        by_q = c.get("/api/v1/leads/all", params={"q": "beta"})
        assert by_q.status_code == 200
        q_items = by_q.json()["today_items"] + by_q.json()["history_items"]
        assert len(q_items) == 1
        assert q_items[0]["name"] == "Beta Deal"
    finally:
        asyncio.run(_clear_leads())
