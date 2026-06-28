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


# ── Auto-compute (system-derived Tracking Report) ─────────────────────────────

AUTO_URL = "/api/v1/current-cc/auto"


async def _seed_auto_fixture(engine) -> None:
    """Leader 402 with one downline member 460 who has a closed sale, a seat-held
    lead, an enrollment share, and an approved recharge — all dated today."""
    from datetime import datetime
    from decimal import Decimal

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.enrollment_share_link import EnrollmentShareLink
    from app.models.lead import Lead
    from app.models.lead_sale import LeadSale
    from app.models.user import User
    from app.models.wallet_recharge import WalletRecharge

    now = datetime.utcnow()
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        # In-memory DB is shared across the session — seed only once.
        if await s.get(User, 402) is not None:
            return
        s.add(User(id=402, fbo_id="F00402", email="leader402@t.myle", role="leader", name="Lead Boss"))
        s.add(
            User(
                id=460, fbo_id="F00460", email="child460@t.myle", role="team",
                name="Child Member", upline_user_id=402,
            )
        )
        await s.flush()

        closed = Lead(
            name="Closed Lead", status="converted", outcome="converted",
            owner_user_id=460, created_by_user_id=460,
        )
        pending = Lead(
            name="Pending Lead", status="seat_hold", outcome="active",
            owner_user_id=460, created_by_user_id=460, seat_hold_amount_cents=50000,
            last_action_at=now,
        )
        s.add_all([closed, pending])
        await s.flush()

        s.add(
            LeadSale(
                lead_id=closed.id, billing_stage="day6", case_credits=Decimal("2.5"),
                status="approved", owner_user_id=460, submitted_by_user_id=460, created_at=now,
            )
        )
        s.add(
            EnrollmentShareLink(
                token="tok-auto-460", created_by_user_id=460, video_source="r2://x",
                viewer_phone="9990001111", created_at=now,
            )
        )
        s.add(
            WalletRecharge(
                user_id=460, amount_cents=119600, status="approved",
                utr_number="UTR460", reviewed_at=now, created_at=now,
            )
        )
        await s.commit()


async def test_auto_computes_all_sections(engine, admin_client: AsyncClient):
    await _seed_auto_fixture(engine)
    resp = await admin_client.get(AUTO_URL, params={"subject_user_id": 402})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # 1 — direct team from the org tree; below the healthy threshold.
    assert body["direct_count"] == 1
    assert "Child Member" in body["direct_persons"]
    assert body["recruitment_low"] is True

    # 4 — closed CCs from the approved sale (not OCR).
    assert body["closed_total_ccs"] == 2.5
    assert any(p["name"] == "Closed Lead" for p in body["closed_persons"])

    # 5 — seat-held, not converted.
    assert any(p["name"] == "Pending Lead" for p in body["pending_persons"])

    # 6/7 — enrollment share + budget recharge submitted & approved (Gurveer check).
    assert body["enrollment_total"] == 1
    cycle = next(r for r in body["lead_cycle_rows"] if r["name"] == "Child Member")
    assert cycle["enrollment"] == 1
    assert cycle["budget_check"] is True
    assert cycle["checked"] is True

    # 2 — member gave a CC this month → real active (not light).
    assert "Child Member" in body["real_active_persons"]
    assert "Child Member" not in body["light_active_persons"]


async def test_auto_scopes_out_non_downline(engine, admin_client: AsyncClient):
    """A member outside 402's downline must not leak into the report."""
    from datetime import datetime
    from decimal import Decimal

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.lead import Lead
    from app.models.lead_sale import LeadSale
    from app.models.user import User

    await _seed_auto_fixture(engine)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(User(id=470, fbo_id="F00470", email="stranger470@t.myle", role="team", name="Stranger"))
        await s.flush()
        outsider = Lead(name="Outsider Lead", status="converted", outcome="converted",
                        owner_user_id=470, created_by_user_id=470)
        s.add(outsider)
        await s.flush()
        s.add(LeadSale(lead_id=outsider.id, billing_stage="day6", case_credits=Decimal("9.0"),
                       status="approved", owner_user_id=470, submitted_by_user_id=470,
                       created_at=datetime.utcnow()))
        await s.commit()

    body = (await admin_client.get(AUTO_URL, params={"subject_user_id": 402})).json()
    assert body["closed_total_ccs"] == 2.5  # outsider's 9.0 excluded
    assert not any(p["name"] == "Outsider Lead" for p in body["closed_persons"])


async def test_auto_forbidden_for_other(team_client: AsyncClient):
    resp = await team_client.get(AUTO_URL, params={"subject_user_id": 999})
    assert resp.status_code == 403


async def test_auto_activity_breakdown_counts_app_logs(engine, admin_client: AsyncClient):
    """Created/uploaded/claimed/calls/retarget come from activity_log + call_events."""
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.activity_log import ActivityLog
    from app.models.call_event import CallEvent
    from app.models.lead import Lead
    from app.models.user import User

    now = datetime.utcnow()
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(User(id=480, fbo_id="F00480", email="caller480@t.myle", role="team", name="Caller"))
        await s.flush()
        # Two leads: one normal, one in retarget state.
        normal = Lead(name="Normal", status="contacted", outcome="active",
                      owner_user_id=480, created_by_user_id=480)
        retgt = Lead(name="Retgt", status="contacted", outcome="recycle",
                     owner_user_id=480, created_by_user_id=480, retarget_at=now)
        s.add_all([normal, retgt])
        await s.flush()

        s.add_all([
            ActivityLog(user_id=480, action="lead.created", created_at=now),
            ActivityLog(user_id=480, action="lead.pool_import", created_at=now),
            ActivityLog(user_id=480, action="lead.claimed", created_at=now),
            ActivityLog(user_id=480, action="lead.claimed_free", created_at=now),
            CallEvent(user_id=480, lead_id=normal.id, outcome="connected", called_at=now),
            CallEvent(user_id=480, lead_id=retgt.id, outcome="connected", called_at=now),
            CallEvent(user_id=480, lead_id=retgt.id, outcome="no_answer", called_at=now),
        ])
        await s.commit()

    body = (await admin_client.get(AUTO_URL, params={"subject_user_id": 480})).json()
    b = body["activity_breakdown"]
    assert b["leads_created"] == 1
    assert b["leads_uploaded"] == 1
    assert b["leads_claimed"] == 2          # claimed + claimed_free
    assert b["calls_total"] == 3
    assert b["retarget_calls"] == 2         # both calls to the retarget lead
