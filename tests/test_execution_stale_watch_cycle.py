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
from app.services.execution_enforcement import stale_redistribute
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
    stale_at = now - timedelta(hours=49)

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

        stale_completed = Lead(
            name="Completed Watch Stale",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000001",
            created_at=stale_at,
            last_action_at=stale_at,
        )
        stale_without_watch = Lead(
            name="No Watch Completion",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000002",
            created_at=stale_at,
            last_action_at=stale_at,
        )
        recent_completed = Lead(
            name="Recent Completion",
            status="video_sent",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000003",
            created_at=now - timedelta(hours=4),
            last_action_at=now - timedelta(hours=4),
        )
        stale_paid = Lead(
            name="Paid Lead",
            status="paid",
            created_by_user_id=3,
            owner_user_id=3,
            assigned_to_user_id=3,
            phone="8000000004",
            created_at=stale_at,
            last_action_at=stale_at,
        )
        session.add_all([stale_completed, stale_without_watch, recent_completed, stale_paid])
        await session.flush()

        session.add_all(
            [
                EnrollShareLink(
                    token="stale-completed-token",
                    lead_id=stale_completed.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=stale_at,
                    last_viewed_at=stale_at,
                    expires_at=now + timedelta(minutes=5),
                ),
                EnrollShareLink(
                    token="recent-completed-token",
                    lead_id=recent_completed.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=now - timedelta(hours=4),
                    last_viewed_at=now - timedelta(hours=4),
                    expires_at=now + timedelta(minutes=5),
                ),
                EnrollShareLink(
                    token="stale-paid-token",
                    lead_id=stale_paid.id,
                    created_by_user_id=3,
                    youtube_url="https://cdn.example.com/enrollment.mp4",
                    status_synced=True,
                    first_viewed_at=stale_at,
                    last_viewed_at=stale_at,
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
            "stale_completed_id": stale_completed.id,
            "stale_without_watch_id": stale_without_watch.id,
            "recent_completed_id": recent_completed.id,
            "stale_paid_id": stale_paid.id,
            "top_worker_id": top_worker.id,
            "second_worker_id": second_worker.id,
            "outside_top_ten_id": outside_top_ten.id,
        }


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_stale_watch_cycle_reassigns_only_completed_watch_leads_and_preserves_owner() -> None:
    asyncio.run(_reset_state())
    seeded = asyncio.run(_seed_cycle_data())
    try:
        async def _exercise() -> None:
            factory = test_conftest.get_test_session_factory()
            async with factory() as session:
                before_wallet_count = int(
                    (await session.execute(select(func.count()).select_from(WalletLedgerEntry))).scalar_one()
                )
                result = await stale_redistribute(session)
                assert result.implemented is True
                assert result.assigned == 1
                assert result.skipped == 0
                assert result.worker_pool_size == 10
                assert result.source_bucket == "completed_watch_stale_leads"
                assert result.max_active_per_worker == 50

                moved = await session.get(Lead, seeded["stale_completed_id"])
                assert moved is not None
                assert moved.owner_user_id == 3
                assert moved.assigned_to_user_id == seeded["second_worker_id"]

                untouched_no_watch = await session.get(Lead, seeded["stale_without_watch_id"])
                assert untouched_no_watch is not None
                assert untouched_no_watch.assigned_to_user_id == 3

                untouched_recent = await session.get(Lead, seeded["recent_completed_id"])
                assert untouched_recent is not None
                assert untouched_recent.assigned_to_user_id == 3

                untouched_paid = await session.get(Lead, seeded["stale_paid_id"])
                assert untouched_paid is not None
                assert untouched_paid.assigned_to_user_id == 3

                log_rows = (
                    await session.execute(
                        select(ActivityLog).where(
                            ActivityLog.action == "lead.stale_watch_reassigned",
                            ActivityLog.entity_id == seeded["stale_completed_id"],
                        )
                    )
                ).scalars().all()
                assert len(log_rows) == 1
                assert log_rows[0].meta["owner_preserved"] is True
                assert log_rows[0].meta["assigned_to_user_id"] == seeded["second_worker_id"]

                after_wallet_count = int(
                    (await session.execute(select(func.count()).select_from(WalletLedgerEntry))).scalar_one()
                )
                assert after_wallet_count == before_wallet_count
                assert seeded["outside_top_ten_id"] not in {row[2] for row in result.assignments}

        asyncio.run(_exercise())
    finally:
        asyncio.run(_reset_state())


def test_execution_stale_redistribute_endpoint_exposes_watch_cycle_contract(
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
        assert body["source_bucket"] == "completed_watch_stale_leads"
        assert body["max_active_per_worker"] == 50
    finally:
        asyncio.run(_reset_state())
