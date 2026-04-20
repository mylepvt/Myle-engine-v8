from __future__ import annotations

import asyncio

import conftest as test_conftest
from sqlalchemy import delete, select

from app.models.activity_log import ActivityLog
from app.models.batch_share_link import BatchShareLink
from app.models.call_event import CallEvent
from app.models.crm_outbox import CrmOutbox
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.wallet_ledger import WalletLedgerEntry
from app.services.crm_outbox import (
    CRM_OUTBOX_STATUS_DONE,
    CRM_OUTBOX_STATUS_PENDING,
    claim_pending_crm_outbox,
    enqueue_lead_shadow_delete,
    enqueue_lead_shadow_upsert,
    mark_crm_outbox_done,
    mark_crm_outbox_retry,
)


async def _clear_tables() -> None:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        await session.execute(delete(BatchShareLink))
        await session.execute(delete(CallEvent))
        await session.execute(delete(CrmOutbox))
        await session.execute(delete(FollowUp))
        await session.execute(delete(WalletLedgerEntry))
        await session.execute(delete(ActivityLog))
        await session.execute(delete(Lead))
        await session.commit()


async def _make_lead(name: str) -> Lead:
    fac = test_conftest.get_test_session_factory()
    async with fac() as session:
        lead = Lead(
            name=name,
            status="new_lead",
            created_by_user_id=1,
            assigned_to_user_id=1,
        )
        session.add(lead)
        await session.commit()
        await session.refresh(lead)
        return lead


def test_enqueue_upsert_and_delete_snapshot_rows() -> None:
    async def run() -> None:
        await _clear_tables()
        fac = test_conftest.get_test_session_factory()
        async with fac() as session:
            lead = Lead(
                name="Outbox Lead",
                status="invited",
                created_by_user_id=1,
                assigned_to_user_id=1,
            )
            session.add(lead)
            await session.flush()

            first_version = enqueue_lead_shadow_upsert(session, lead)
            lead.deleted_at = lead.created_at
            second_version = enqueue_lead_shadow_delete(session, lead)
            await session.commit()

            rows = (
                await session.execute(
                    select(CrmOutbox).where(CrmOutbox.lead_id == lead.id).order_by(CrmOutbox.version.asc())
                )
            ).scalars().all()
            assert first_version == 1
            assert second_version == 2
            assert lead.crm_shadow_version == 2
            assert len(rows) == 2
            assert rows[0].payload["deleted"] is False
            assert rows[1].payload["deleted"] is True
            assert rows[1].payload["version"] == 2
            assert rows[1].status == CRM_OUTBOX_STATUS_PENDING

    asyncio.run(run())


def test_claim_pending_outbox_respects_per_lead_ordering() -> None:
    async def run() -> None:
        await _clear_tables()
        fac = test_conftest.get_test_session_factory()
        async with fac() as session:
            lead_a = Lead(
                name="Lead A",
                status="new_lead",
                created_by_user_id=1,
                assigned_to_user_id=1,
            )
            lead_b = Lead(
                name="Lead B",
                status="new_lead",
                created_by_user_id=1,
                assigned_to_user_id=1,
            )
            session.add_all([lead_a, lead_b])
            await session.flush()

            enqueue_lead_shadow_upsert(session, lead_a)
            lead_a.status = "invited"
            enqueue_lead_shadow_upsert(session, lead_a)
            enqueue_lead_shadow_upsert(session, lead_b)
            await session.commit()

        async with fac() as session:
            claimed = await claim_pending_crm_outbox(session, limit=10)
            versions = sorted((event.lead_id, event.version) for event in claimed)
            assert versions == sorted([(lead_a.id, 1), (lead_b.id, 1)])

        async with fac() as session:
            claimed = await claim_pending_crm_outbox(session, limit=10)
            assert claimed == []

        async with fac() as session:
            processing = (
                await session.execute(
                    select(CrmOutbox).where(CrmOutbox.status != CRM_OUTBOX_STATUS_DONE).order_by(CrmOutbox.version.asc())
                )
            ).scalars().all()
            for row in processing:
                if row.version == 1:
                    await mark_crm_outbox_done(session, row.id)

        async with fac() as session:
            claimed = await claim_pending_crm_outbox(session, limit=10)
            assert [(event.lead_id, event.version) for event in claimed] == [(lead_a.id, 2)]

    asyncio.run(run())


def test_retry_keeps_event_pending_with_incremented_attempts() -> None:
    async def run() -> None:
        await _clear_tables()
        fac = test_conftest.get_test_session_factory()
        async with fac() as session:
            lead = Lead(
                name="Retry Lead",
                status="new_lead",
                created_by_user_id=1,
                assigned_to_user_id=1,
            )
            session.add(lead)
            await session.flush()
            enqueue_lead_shadow_upsert(session, lead)
            await session.commit()

        async with fac() as session:
            claimed = await claim_pending_crm_outbox(session, limit=1)
            assert len(claimed) == 1
            event = claimed[0]

        async with fac() as session:
            await mark_crm_outbox_retry(session, event, "crm down")
            row = (
                await session.execute(select(CrmOutbox).where(CrmOutbox.id == event.id))
            ).scalar_one()
            assert row.status == CRM_OUTBOX_STATUS_PENDING
            assert row.retries == 1
            assert row.last_error == "crm down"
            assert row.next_attempt_at is not None

    asyncio.run(run())
