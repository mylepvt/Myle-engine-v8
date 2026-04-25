from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import conftest as test_conftest
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.models.activity_log import ActivityLog
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services.execution_enforcement import run_completed_watch_pipeline_maintenance
from main import app
from util_jwt_patch import patch_jwt_settings


async def _reset_state() -> None:
    factory = test_conftest.get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(ActivityLog))
        await session.execute(delete(EnrollShareLink))
        await session.execute(delete(WalletLedgerEntry))
        await session.execute(delete(Lead))
        await session.execute(delete(User).where(User.id > 3))
        await session.commit()


async def _seed_cycle_data() -> dict[str, int]:
    factory = test_conftest.get_test_session_factory()
    now = datetime.now(timezone.utc)
    archive_only_at = now - timedelta(hours=30)
    archive_and_reassign_at = now - timedelta(hours=49)
    archived_stale_watch_at = now - timedelta(hours=50)

    async with factory() as session:
        ranked_workers: list[User] = []
        for idx in range(1, 12):
            ranked_workers.append(
                User(
                    fbo_id=f"stale-team-{idx}",
                    username=f"stale_team_{idx}",
                    email=f"stale-team-{idx}@example.com",
                    role="team",
                    registration_status="approved",
                    xp_total=1_500 - idx,
                )
            )
        session.add_all(ranked_workers)
        session.add(
            User(
                fbo_id="stale-leader-decoy",
                username="stale_leader_decoy",
                email="stale-leader-decoy@example.com",
                role="leader",
                registration_status="approved",
                xp_total=9_999,
            )
        )
        await session.flush()

        top_worker = ranked_workers[0]
        second_worker = ranked_workers[1]
        third_worker = ranked_workers[2]
        outside_top_ten = ranked_workers[-1]

        for idx in range(50):
            session.add(
                Lead(
                    name=f"Capacity Lead {idx}",
                    status="new_lead",
                    created_by_user_id=top_worker.id,
                    owner_user_id=top_worker.id,
                    assigned_to_user_id=top_worker.id,
                    phone=f"7000000{idx:03d}",
                    created_at=now - timedelta(hours=2),
                    last_action_at=now - timedelta(hours=1),
                )
            )

        archive_only = Lead(
            name="Archive Only Lead",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000001",
            created_at=archive_only_at,
            last_action_at=archive_only_at,
        )
        archive_and_reassign = Lead(
            name="Archive And Reassign Lead",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000002",
            created_at=archive_and_reassign_at,
            last_action_at=archive_and_reassign_at,
        )
        already_archived_stale = Lead(
            name="Archived Stale Lead",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000003",
            created_at=archived_stale_watch_at,
            last_action_at=archived_stale_watch_at,
            archived_at=now - timedelta(hours=26),
        )
        stale_without_watch = Lead(
            name="No Watch Completion",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000004",
            created_at=archive_and_reassign_at,
            last_action_at=archive_and_reassign_at,
        )
        stale_paid = Lead(
            name="Paid Lead",
            status="paid",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000005",
            created_at=archive_and_reassign_at,
            last_action_at=archive_and_reassign_at,
            archived_at=now - timedelta(hours=30),
        )
        session.add_all(
            [
                archive_only,
                archive_and_reassign,
                already_archived_stale,
                stale_without_watch,
                stale_paid,
            ]
        )
        await session.flush()

        session.add_all(
            [
                EnrollShareLink(
                    token="archive-only-token",
                    lead_id=archive_only.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=archive_only_at,
                    last_viewed_at=archive_only_at,
                    expires_at=now + timedelta(minutes=5),
                ),
                EnrollShareLink(
                    token="archive-and-reassign-token",
                    lead_id=archive_and_reassign.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=archive_and_reassign_at,
                    last_viewed_at=archive_and_reassign_at,
                    expires_at=now + timedelta(minutes=5),
                ),
                EnrollShareLink(
                    token="already-archived-token",
                    lead_id=already_archived_stale.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=archived_stale_watch_at,
                    last_viewed_at=archived_stale_watch_at,
                    expires_at=now + timedelta(minutes=5),
                ),
                EnrollShareLink(
                    token="stale-paid-token",
                    lead_id=stale_paid.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=archive_and_reassign_at,
                    last_viewed_at=archive_and_reassign_at,
                    expires_at=now + timedelta(minutes=5),
                ),
            ]
        )
        session.add(
            WalletLedgerEntry(
                user_id=3,
                amount_cents=1234,
                currency="INR",
                idempotency_key="stale-watch-wallet-safe",
                note="preexisting wallet row",
                created_by_user_id=1,
            )
        )
        await session.commit()

        return {
            "archive_only_id": archive_only.id,
            "archive_and_reassign_id": archive_and_reassign.id,
            "already_archived_stale_id": already_archived_stale.id,
            "stale_without_watch_id": stale_without_watch.id,
            "stale_paid_id": stale_paid.id,
            "second_worker_id": second_worker.id,
            "third_worker_id": third_worker.id,
            "outside_top_ten_id": outside_top_ten.id,
        }


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_completed_watch_pipeline_archives_then_reassigns_without_changing_owner() -> None:
    asyncio.run(_reset_state())
    seeded = asyncio.run(_seed_cycle_data())
    try:
        async def _exercise() -> None:
            factory = test_conftest.get_test_session_factory()
            async with factory() as session:
                before_wallet_count = int(
                    (await session.execute(select(func.count()).select_from(WalletLedgerEntry))).scalar_one()
                )
                result = await run_completed_watch_pipeline_maintenance(session)
                assert result == {
                    "auto_archived": 2,
                    "reassigned": 2,
                    "skipped": 0,
                }

                archive_only = await session.get(Lead, seeded["archive_only_id"])
                assert archive_only is not None
                assert archive_only.owner_user_id == 3
                assert archive_only.assigned_to_user_id == 3
                assert archive_only.archived_at is not None

                archive_and_reassign = await session.get(Lead, seeded["archive_and_reassign_id"])
                assert archive_and_reassign is not None
                assert archive_and_reassign.owner_user_id == 3
                assert archive_and_reassign.assigned_to_user_id == seeded["third_worker_id"]
                assert archive_and_reassign.archived_at is None

                already_archived_stale = await session.get(Lead, seeded["already_archived_stale_id"])
                assert already_archived_stale is not None
                assert already_archived_stale.owner_user_id == 3
                assert already_archived_stale.assigned_to_user_id == seeded["second_worker_id"]
                assert already_archived_stale.archived_at is None

                untouched_no_watch = await session.get(Lead, seeded["stale_without_watch_id"])
                assert untouched_no_watch is not None
                assert untouched_no_watch.assigned_to_user_id == 3
                assert untouched_no_watch.archived_at is None

                untouched_paid = await session.get(Lead, seeded["stale_paid_id"])
                assert untouched_paid is not None
                assert untouched_paid.assigned_to_user_id == 3
                assert untouched_paid.archived_at is not None

                archive_logs = (
                    await session.execute(
                        select(ActivityLog).where(ActivityLog.action == "lead.auto_archived_after_watch")
                    )
                ).scalars().all()
                assert {log.entity_id for log in archive_logs} == {
                    seeded["archive_only_id"],
                    seeded["archive_and_reassign_id"],
                }

                reassign_logs = (
                    await session.execute(
                        select(ActivityLog).where(ActivityLog.action == "lead.stale_watch_reassigned")
                    )
                ).scalars().all()
                assert {log.entity_id for log in reassign_logs} == {
                    seeded["archive_and_reassign_id"],
                    seeded["already_archived_stale_id"],
                }
                assert all(log.meta["owner_preserved"] is True for log in reassign_logs)
                assert all(
                    log.meta["source_bucket"] == "archived_completed_watch_stale_leads"
                    for log in reassign_logs
                )

                after_wallet_count = int(
                    (await session.execute(select(func.count()).select_from(WalletLedgerEntry))).scalar_one()
                )
                assert after_wallet_count == before_wallet_count
                reassigned_users = {
                    int(log.meta["assigned_to_user_id"])
                    for log in reassign_logs
                }
                assert seeded["outside_top_ten_id"] not in reassigned_users

        asyncio.run(_exercise())
    finally:
        asyncio.run(_reset_state())


def test_execution_stale_redistribute_endpoint_exposes_archived_watch_cycle_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asyncio.run(_reset_state())
    try:
        c = _client(monkeypatch)
        assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
        res = c.post("/api/v1/execution/stale-redistribute")
        assert res.status_code == 200
        body = res.json()
        assert body["implemented"] is True
        assert body["source_bucket"] == "archived_completed_watch_stale_leads"
        assert body["max_active_per_worker"] == 50
    finally:
        asyncio.run(_reset_state())
