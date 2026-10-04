"""Day 3 "slot reserved till": leader/admin set it (future, ≤7 days), team can't, clear works."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tests.test_lead_journey_edge import _as_role, _create_lead, _seed_hierarchy


async def test_leader_sets_and_clears_the_slot_deadline(engine):
    await _seed_hierarchy(engine)
    async with _as_role(engine, "team", 201) as team:
        lead_id = await _create_lead(team, "9000000042")
        in_3h = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        r = await team.patch(f"/api/v1/leads/{lead_id}", json={"slot_deadline_at": in_3h})
        assert r.status_code == 403  # team can't set it

    async with _as_role(engine, "leader", 202) as leader:
        r = await leader.patch(f"/api/v1/leads/{lead_id}", json={"slot_deadline_at": in_3h})
        assert r.status_code == 200, r.text
        got = datetime.fromisoformat(r.json()["slot_deadline_at"].replace("Z", "+00:00"))
        got = got if got.tzinfo else got.replace(tzinfo=timezone.utc)  # SQLite drops the offset
        assert abs((got - datetime.fromisoformat(in_3h)).total_seconds()) < 1

        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        assert (await leader.patch(f"/api/v1/leads/{lead_id}", json={"slot_deadline_at": past})).status_code == 400
        far = (datetime.now(timezone.utc) + timedelta(days=8)).isoformat()
        assert (await leader.patch(f"/api/v1/leads/{lead_id}", json={"slot_deadline_at": far})).status_code == 400

        r = await leader.patch(f"/api/v1/leads/{lead_id}", json={"clear_slot_deadline": True})
        assert r.status_code == 200 and r.json()["slot_deadline_at"] is None
