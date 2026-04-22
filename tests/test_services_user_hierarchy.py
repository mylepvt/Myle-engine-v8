from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.models.lead import Lead
from app.services.execution_enforcement import admin_at_risk_leads
from app.services.user_hierarchy import (
    is_user_in_downline_of,
    nearest_leader_for_user,
    nearest_leader_username_for_user_id,
    recursive_downline_user_ids,
)
from conftest import get_test_session_factory


async def _clear_leads() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(Lead))
        await session.commit()


def test_user_hierarchy_core_uses_org_tree_data() -> None:
    async def runner() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            assert await recursive_downline_user_ids(session, 2) == [3]
            assert await is_user_in_downline_of(session, 3, 2) is True
            assert await is_user_in_downline_of(session, 2, 3) is False

            leader = await nearest_leader_for_user(session, 3)
            assert leader is not None
            assert leader.id == 2
            assert leader.username == "TestLeaderDisplay"
            assert await nearest_leader_username_for_user_id(session, 3) == "TestLeaderDisplay"

    asyncio.run(runner())


def test_at_risk_leads_resolve_leader_from_org_tree_even_without_team_username() -> None:
    stale_at = datetime.now(timezone.utc) - timedelta(hours=72)

    async def runner() -> None:
        factory = get_test_session_factory()
        async with factory() as session:
            session.add(
                Lead(
                    name="Stale Team Lead",
                    status="contacted",
                    created_by_user_id=3,
                    owner_user_id=3,
                    assigned_to_user_id=3,
                    created_at=stale_at,
                    last_action_at=stale_at,
                    phone="9000000001",
                )
            )
            await session.commit()

            items = await admin_at_risk_leads(session, stale_hours=48, limit=20)
            assert len(items) == 1
            assert items[0].team_member_display == "fbo-team-001"
            assert items[0].leader_username == "TestLeaderDisplay"

    try:
        asyncio.run(runner())
    finally:
        asyncio.run(_clear_leads())
