"""Tests for Current CC daily sheet endpoints (CURRENT CCs v/s TARGET CCs).

Covers upsert / read / mine / trends + permission + date-lock rules.
"""
from __future__ import annotations

from datetime import datetime

from httpx import AsyncClient

PUT_URL = "/api/v1/current-cc/sheet"
GET_URL = "/api/v1/current-cc/sheet"
MINE_URL = "/api/v1/current-cc/mine"
TRENDS_URL = "/api/v1/current-cc/trends"


def _today_iso() -> str:
    from app.services.team_reports_metrics import IST

    return datetime.now(IST).date().isoformat()


def _payload(subject_user_id: int, sheet_date: str | None = None) -> dict:
    return {
        "subject_user_id": subject_user_id,
        "sheet_date": sheet_date or _today_iso(),
        "target_ccs": 10.0,
        "direct_persons": ["Aman", "Riya"],
        "direct_total_ccs": 4.0,
        "real_active_persons": ["Karan"],
        "light_active_persons": ["Sahil"],
        "closed_persons": [
            {"name": "Aman", "ccs": 1.5, "current_state": "paid", "next_task": "onboard"},
            {"name": "Riya", "ccs": 0.5, "current_state": "paid", "next_task": "call"},
        ],
        "pending_persons": [
            {"name": "Vikas", "ccs": 1.0, "current_state": "warm", "next_task": "follow up"},
        ],
        "enrollment_rows": [
            {"name": "Aman", "fresh_lead": 3, "old_lead": 2},
            {"name": "Riya", "fresh_lead": 1, "old_lead": 0},
        ],
        "lead_cycle_rows": [
            {"name": "Karan", "enrollment": 2, "budget_check": True, "checked": True},
            {"name": "Sahil", "enrollment": 0, "budget_check": False, "checked": False},
        ],
        "lead_covered": "yes",
        "process_check": "done",
        "enrollment_tracking_rows": [
            {"name": "Vikas", "current_state": "watching", "drop_continue": "continue", "day1": "yes"},
        ],
        "drop_reason_remarks": "none",
        "improvement_area": "more calls",
    }


async def test_member_saves_own_sheet(team_client: AsyncClient):
    resp = await team_client.put(PUT_URL, json=_payload(201))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["subject_user_id"] == 201
    assert body["target_ccs"] == 10.0
    assert body["direct_persons"] == ["Aman", "Riya"]
    # closed CCs sum = 1.5 + 0.5
    assert body["closed_total_ccs"] == 2.0
    assert body["current_ccs"] == 2.0
    assert body["pending_total_ccs"] == 1.0
    # enrollment total = (3+2)+(1+0) = 6
    assert body["enrollment_total"] == 6
    assert body["lead_cycle_checked"] == 1
    assert body["lead_cycle_total"] == 2


async def test_read_after_save(team_client: AsyncClient):
    await team_client.put(PUT_URL, json=_payload(201))
    resp = await team_client.get(GET_URL, params={"subject_user_id": 201, "date": _today_iso()})
    assert resp.status_code == 200
    body = resp.json()
    assert body is not None
    assert body["improvement_area"] == "more calls"
    assert body["closed_persons"][0]["next_task"] == "onboard"
    assert body["enrollment_tracking_rows"][0]["drop_continue"] == "continue"


async def test_mine_endpoint(team_client: AsyncClient):
    await team_client.put(PUT_URL, json=_payload(201))
    resp = await team_client.get(MINE_URL, params={"date": _today_iso()})
    assert resp.status_code == 200
    assert resp.json()["subject_user_id"] == 201


async def test_read_missing_returns_null(team_client: AsyncClient):
    resp = await team_client.get(GET_URL, params={"subject_user_id": 201, "date": "2000-01-01"})
    assert resp.status_code == 200
    assert resp.json() is None


async def test_member_cannot_save_for_other(team_client: AsyncClient):
    resp = await team_client.put(PUT_URL, json=_payload(999))
    assert resp.status_code == 403


async def test_member_future_date_rejected(team_client: AsyncClient):
    resp = await team_client.put(PUT_URL, json=_payload(201, "2099-12-31"))
    assert resp.status_code == 400


async def test_admin_can_backdate_and_target_anyone(admin_client: AsyncClient):
    resp = await admin_client.put(PUT_URL, json=_payload(201, "2020-01-01"))
    assert resp.status_code == 200


async def test_resave_updates(team_client: AsyncClient):
    await team_client.put(PUT_URL, json=_payload(201))
    second = _payload(201)
    second["improvement_area"] = "updated"
    second["closed_persons"] = [{"name": "Aman", "ccs": 9.0, "current_state": "paid", "next_task": "x"}]
    resp = await team_client.put(PUT_URL, json=second)
    assert resp.status_code == 200
    body = resp.json()
    assert body["improvement_area"] == "updated"
    assert body["closed_total_ccs"] == 9.0


async def test_match_flag_when_no_activity(team_client: AsyncClient):
    """Claimed CCs but ZERO activity logged → mismatch + flagged for admin."""
    resp = await team_client.put(PUT_URL, json=_payload(201))
    assert resp.status_code == 200
    body = resp.json()
    assert body["actuals"]["calls"] == 0
    cc_item = next(i for i in body["match"]["items"] if i["metric"] == "cc_activity")
    assert cc_item["status"] == "mismatch"
    assert body["match"]["flagged"] is True


async def test_match_green_with_activity(engine, admin_client: AsyncClient):
    """Seed real activity for subject 205 → CC claim backed by activity → green."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.daily_member_stat import DailyMemberStat
    from app.services.current_cc import today_ist

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(
            DailyMemberStat(
                user_id=205,
                stat_date=today_ist(),
                leads_added_count=8,
                calls_count=12,
                followups_done_count=4,
            )
        )
        await s.commit()

    payload = _payload(205)
    payload["closed_persons"] = [{"name": "X", "ccs": 2.0, "current_state": "paid", "next_task": "-"}]
    payload["enrollment_rows"] = [{"name": "X", "fresh_lead": 3, "old_lead": 0}]
    resp = await admin_client.put(PUT_URL, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["actuals"]["calls"] == 12
    assert body["actuals"]["leads_added"] == 8
    cc_item = next(i for i in body["match"]["items"] if i["metric"] == "cc_activity")
    assert cc_item["status"] == "match"  # CCs claimed + activity > 0
    enroll_item = next(i for i in body["match"]["items"] if i["metric"] == "enrollment")
    assert enroll_item["status"] == "match"  # claimed 3 <= leads_added 8
    assert body["match"]["flagged"] is False


async def test_overview_forbidden_for_team(team_client: AsyncClient):
    resp = await team_client.get("/api/v1/current-cc/overview")
    assert resp.status_code == 403


async def test_overview_leader_ok(leader_client: AsyncClient):
    resp = await leader_client.get("/api/v1/current-cc/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert "sheet_date" in body
    assert isinstance(body["rows"], list)


async def test_compare_structure(team_client: AsyncClient):
    await team_client.put(PUT_URL, json=_payload(201))
    resp = await team_client.get("/api/v1/current-cc/compare", params={"subject_user_id": 201})
    assert resp.status_code == 200
    body = resp.json()
    assert body["week"]["label"] == "Last 7 days"
    assert body["month"]["label"] == "Last 30 days"
    # Current week has the sheet's closed CCs (2.0); no prior data → pct None.
    assert body["week"]["cc_current"] == 2.0
    assert body["week"]["cc_previous"] == 0
    assert body["week"]["cc_pct"] is None


async def test_compare_forbidden_for_other(team_client: AsyncClient):
    resp = await team_client.get("/api/v1/current-cc/compare", params={"subject_user_id": 999})
    assert resp.status_code == 403


async def test_trends_after_save(team_client: AsyncClient):
    await team_client.put(PUT_URL, json=_payload(201))
    resp = await team_client.get(TRENDS_URL, params={"subject_user_id": 201, "days": 30})
    assert resp.status_code == 200
    points = resp.json()["points"]
    assert len(points) >= 1
    pt = points[-1]
    assert pt["direct"] == 2
    assert pt["closed"] == 2
    assert pt["closed_ccs"] == 2.0
    assert pt["enrollment_total"] == 6
    assert pt["target_ccs"] == 10.0
