"""Process rewards: MYLE Points only on proof, once per step, and the daily ₹150 jackpot."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.call_event import CallEvent
from app.models.day2_test_session import Day2TestSession
from app.models.flp_min_billing_share_link import FlpMinBillingShareLink
from app.models.lead import Lead
from app.models.process_reward import ProcessPoint
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services import process_rewards as pr

PRIYA, RAHUL, LEADER, ADMIN = 1, 2, 3, 4
# 15:00 IST today — before the 21:00 draw.
NOW = datetime.now(IST).replace(hour=15, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
LAUNCH = NOW - timedelta(days=1)


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def _seed(s: AsyncSession) -> None:
    s.add_all([
        User(id=PRIYA, fbo_id="f1", email="p@t", role="team", name="Priya Sharma", phone="9000000001"),
        User(id=RAHUL, fbo_id="f2", email="r@t", role="team", name="Rahul", phone="9000000002"),
        User(id=LEADER, fbo_id="f3", email="l@t", role="leader", name="Aman"),
        User(id=ADMIN, fbo_id="f4", email="a@t", role="admin", name="Admin"),
        AppSetting(key=pr.LAUNCH_KEY, value=LAUNCH.isoformat()),
    ])
    await s.flush()


_tok = iter(range(1, 10_000))


def _lead(lead_id: int, owner: int = PRIYA, **kw) -> Lead:
    base = dict(
        id=lead_id, name=f"Prospect {lead_id}", status="day1", created_by_user_id=owner, owner_user_id=owner,
        assigned_to_user_id=owner, in_pool=False, call_count=0, phone=f"98000000{lead_id:02d}",
        created_at=NOW - timedelta(days=2), last_action_at=NOW - timedelta(hours=1),
    )
    base.update(kw)
    return Lead(**base)


def _video(lead_id: int, at: datetime) -> FlpMinBillingShareLink:
    return FlpMinBillingShareLink(
        token=f"flp{next(_tok)}", lead_id=lead_id, created_by_user_id=PRIYA, first_viewed_at=at,
        expires_at=at + timedelta(days=1),
    )


def _batch(lead_id: int, slot: str, at: datetime) -> BatchShareLink:
    return BatchShareLink(token=f"b{next(_tok)}", lead_id=lead_id, slot=slot, created_by_user_id=LEADER, used=True, used_at=at)


def _test_pass(lead_id: int, at: datetime) -> Day2TestSession:
    return Day2TestSession(
        token=f"t{next(_tok)}", lead_id=lead_id, created_by_user_id=LEADER, status="submitted", passed=True, submitted_at=at
    )


def _tick(lead_id: int, task: str, by: int, at: datetime) -> ActivityLog:
    return ActivityLog(user_id=by, action="process.task_done", entity_type="lead", entity_id=lead_id,
                       meta={"stage": "day3", "task": task}, created_at=at)


async def _points(s: AsyncSession, live_only: bool = True) -> dict[str, int]:
    stmt = select(ProcessPoint)
    if live_only:
        stmt = stmt.where(ProcessPoint.revoked_at.is_(None))
    return {f"{p.lead_id}:{p.step}": p.points for p in (await s.execute(stmt)).scalars().all()}


async def test_full_funnel_pays_each_verified_step_once(Session):
    t = NOW - timedelta(hours=3)
    async with Session() as s:
        await _seed(s)
        s.add(_lead(
            1, status="converted", stage_selected="stage2", day3_completed_at=t,
            mindset_completed_at=t, mindset_completed_by_user_id=LEADER,
            d1_morning=True, d1_afternoon=True, d1_evening=True, d2_morning=True,
            process_tracking={"day3": {"day3_interview": True, "day3_live_session": True,
                                       "day3_blueprint_video": True, "day3_stage_selection": True}},
        ))
        await s.flush()
        s.add_all([
            _video(1, t),
            *[_batch(1, slot, t) for slot in ("d1_morning", "d1_afternoon", "d1_evening", "d2_morning")],
            _test_pass(1, t),
            *[_tick(1, task, LEADER, t) for task in
              ("day3_interview", "day3_live_session", "day3_blueprint_video", "day3_stage_selection")],
        ])
        await s.commit()

        assert (await pr.scan(s, NOW))["awarded"] == 13
        pts = await _points(s)
        assert pts == {
            "1:video_watched": 25, "1:mindset_complete": 20,
            "1:d1_morning": 10, "1:d1_afternoon": 10, "1:d1_evening": 10, "1:d1_all": 15, "1:d2_morning": 10,
            "1:day2_test_passed": 30, "1:day3_interview": 25, "1:day3_2cc": 25, "1:day3_blueprint": 25,
            "1:stage_selected": 50, "1:converted": 150,
        }
        assert all(p.user_id == PRIYA for p in (await s.execute(select(ProcessPoint))).scalars())
        # Scanning again never pays twice.
        assert (await pr.scan(s, NOW + timedelta(minutes=10)))["awarded"] == 0


async def test_self_marked_and_unproven_steps_pay_nothing(Session):
    t = NOW - timedelta(hours=2)
    async with Session() as s:
        await _seed(s)
        s.add_all([
            # Priya ticks Day 3 + mindset herself, batch flags set by hand without the prospect watching.
            _lead(1, status="day3", mindset_completed_at=t, mindset_completed_by_user_id=PRIYA, d1_morning=True,
                  process_tracking={"day3": {"day3_interview": True}}),
            # Leader ticks Day 3, but the prospect never passed the Day 2 test.
            _lead(2, status="day3", process_tracking={"day3": {"day3_interview": True}}),
        ])
        await s.flush()
        s.add_all([_tick(1, "day3_interview", PRIYA, t), _test_pass(1, t), _tick(2, "day3_interview", LEADER, t)])
        await s.commit()

        await pr.scan(s, NOW)
        assert await _points(s) == {"1:day2_test_passed": 30}


async def test_own_number_admin_and_pre_launch_are_blocked(Session):
    t = NOW - timedelta(hours=2)
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _lead(1, phone="+91 90000 00001"),  # Priya's own number
            _lead(2, owner=ADMIN),
            _lead(3),
        ])
        await s.flush()
        s.add_all([_video(1, t), _video(2, t), _video(3, LAUNCH - timedelta(minutes=5))])
        await s.commit()

        await pr.scan(s, NOW)
        assert await _points(s) == {}


async def test_proof_gone_revokes_and_comes_back(Session):
    t = NOW - timedelta(hours=2)
    async with Session() as s:
        await _seed(s)
        s.add(_lead(1, d1_morning=True, d1_afternoon=True, d1_evening=True))
        await s.flush()
        s.add_all([_batch(1, slot, t) for slot in ("d1_morning", "d1_afternoon", "d1_evening")])
        await s.commit()
        await pr.scan(s, NOW)
        assert "1:d1_all" in await _points(s)

        lead = await s.get(Lead, 1)
        lead.d1_morning = False  # leader corrects a wrong tick
        await s.commit()
        assert (await pr.scan(s, NOW + timedelta(minutes=10)))["revoked"] == 2
        assert set(await _points(s)) == {"1:d1_afternoon", "1:d1_evening"}

        lead.d1_morning = True
        await s.commit()
        await pr.scan(s, NOW + timedelta(minutes=20))
        assert len(await _points(s)) == 4

        lead.deleted_at = NOW
        await s.commit()
        await pr.scan(s, NOW + timedelta(minutes=30))
        assert await _points(s) == {}
        reasons = {p.revoked_reason for p in (await s.execute(select(ProcessPoint))).scalars()}
        assert reasons == {"lead_deleted"}


async def test_admin_revoke_sticks(Session):
    async with Session() as s:
        await _seed(s)
        s.add(_lead(1))
        await s.flush()
        s.add(_video(1, NOW - timedelta(hours=1)))
        await s.commit()
        await pr.scan(s, NOW)
        point = (await s.execute(select(ProcessPoint))).scalar_one()
        point.revoked_at, point.revoked_reason = NOW, "admin"
        await s.commit()
        await pr.scan(s, NOW + timedelta(minutes=10))
        assert await _points(s) == {}


async def test_self_logged_steps_are_capped_per_day(Session):
    async with Session() as s:
        await _seed(s)
        for i in range(1, 7):
            s.add(_lead(i, status="video_watched"))
        await s.flush()
        for i in range(1, 7):
            s.add(_video(i, NOW - timedelta(hours=1, minutes=i)))
        # Fast first call after a pool claim + a connected call → 5 + 2 (still inside the cap? no: cap is full).
        s.add(ActivityLog(user_id=RAHUL, action="lead.claimed", entity_type="lead", entity_id=6, created_at=NOW - timedelta(hours=3)))
        await s.commit()
        await pr.scan(s, NOW)
        pts = await _points(s)
        assert sum(pts.values()) == pr.EARLY_DAILY_CAP  # 4 × 25, the rest wait — never roll into tomorrow
        assert len(pts) == 4

        # Yesterday's leftover videos don't pay tomorrow.
        await pr.scan(s, NOW + timedelta(days=1))
        assert len(await _points(s)) == 4


async def test_fast_first_call_and_connected_calls(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([_lead(1, status="contacted"), _lead(2, status="contacted")])
        await s.flush()
        claim = NOW - timedelta(hours=4)
        s.add_all([
            ActivityLog(user_id=PRIYA, action="lead.claimed", entity_type="lead", entity_id=1, created_at=claim),
            ActivityLog(user_id=PRIYA, action="lead.claimed", entity_type="lead", entity_id=2, created_at=claim),
            CallEvent(lead_id=1, user_id=PRIYA, outcome="answered", called_at=claim + timedelta(minutes=30)),
            CallEvent(lead_id=1, user_id=PRIYA, outcome="answered", called_at=claim + timedelta(minutes=50)),
            CallEvent(lead_id=2, user_id=PRIYA, outcome="no_answer", called_at=claim + timedelta(hours=3)),
        ])
        await s.commit()
        await pr.scan(s, NOW)
        day = (claim + timedelta(minutes=30)).astimezone(IST).date().isoformat()
        assert await _points(s) == {"1:fast_first_call": 5, f"1:connected_call:{day}": 2}


def test_tickets_and_windows():
    assert pr.tickets_for(49) == 0
    assert pr.tickets_for(120) == 2
    assert pr.tickets_for(5_000) == 10
    d = date(2026, 10, 6)
    start, end = pr.draw_window(d)
    assert end == datetime(2026, 10, 6, 21, 0, tzinfo=IST)
    assert start == datetime(2026, 10, 5, 21, 0, tzinfo=IST)
    assert pr.current_draw_date(datetime(2026, 10, 6, 20, 59, tzinfo=IST)) == d
    assert pr.current_draw_date(datetime(2026, 10, 6, 21, 0, tzinfo=IST)) == date(2026, 10, 7)
    assert pr.pick_winner({1: 2, 2: 3}, lambda n: 0) == 1
    assert pr.pick_winner({1: 2, 2: 3}, lambda n: 2) == 2
    assert pr.pick_winner({}, lambda n: 0) is None


async def test_draw_credits_wallet_once_and_rolls_over(Session):
    d = NOW.astimezone(IST).date()
    async with Session() as s:
        await _seed(s)
        s.add_all([_lead(1), _lead(2, owner=RAHUL)])
        await s.flush()
        # Day 1: nobody has a ticket → pot rolls over.
        empty = await pr.run_draw(s, d - timedelta(days=1))
        assert empty.winner_user_id is None and empty.pot_cents == 15_000

        s.add_all([
            ProcessPoint(user_id=PRIYA, lead_id=1, step="day2_test_passed", points=30, created_at=NOW),
            ProcessPoint(user_id=PRIYA, lead_id=1, step="converted", points=150, created_at=NOW),  # 180 → 3 tickets
            ProcessPoint(user_id=RAHUL, lead_id=2, step="video_watched", points=25, created_at=NOW),  # 0 tickets
            ProcessPoint(user_id=RAHUL, lead_id=2, step="day2_test_passed", points=999, created_at=NOW,
                         revoked_at=NOW, revoked_reason="admin"),
        ])
        await s.commit()
        assert await pr.eligible_tickets(s, d) == {PRIYA: 3}

        draw = await pr.run_draw(s, d, lambda n: n - 1)
        assert (draw.winner_user_id, draw.pot_cents, draw.tickets_total) == (PRIYA, 30_000, 3)
        again = await pr.run_draw(s, d, lambda n: 0)
        assert again.id == draw.id
        credits = (await s.execute(select(WalletLedgerEntry))).scalars().all()
        assert [(c.user_id, c.amount_cents, c.idempotency_key) for c in credits] == [
            (PRIYA, 30_000, f"jackpot:{d.isoformat()}")
        ]
        # After a win, tomorrow's pot is back to ₹150.
        assert await pr.pot_for(s, d + timedelta(days=1)) == 15_000


async def test_my_rewards_and_pipeline(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _lead(1, status="day3", stage_selected="stage3"),
            _lead(2, status="day2", last_action_at=NOW - timedelta(hours=30)),  # at risk
            _lead(3, status="converted"),  # done, not in the pipeline
            _lead(4, status="day1", owner=RAHUL),
        ])
        await s.flush()
        s.add(ProcessPoint(user_id=PRIYA, lead_id=1, step="stage_selected", points=50, created_at=NOW - timedelta(hours=1)))
        await s.commit()

        me = await s.get(User, PRIYA)
        out = await pr.my_rewards(s, me, NOW)
        assert out["points_today"] == 50 and out["tickets"] == 1 and out["next_ticket_in"] == 50
        assert out["pot_rupees"] == 150
        assert out["recent"][0]["label"] == "Stage selected"
        pipe = out["pipeline"]
        assert (pipe["total_rupees"], pipe["active"], pipe["at_risk"], pipe["at_risk_rupees"]) == (8_500, 2, 1, 1_500)
        assert pipe["leads"][0]["lead_id"] == 2  # at-risk first

        admin = await s.get(User, ADMIN)
        assert (await pr.my_rewards(s, admin, NOW))["eligible"] is False


async def test_launch_cutoff_is_set_on_first_scan(Session):
    async with Session() as s:
        await s.commit()
        await pr.scan(s, NOW)
        row = await s.get(AppSetting, pr.LAUNCH_KEY)
        assert row is not None and datetime.fromisoformat(row.value) == NOW
        assert (await s.execute(select(func.count(ProcessPoint.id)))).scalar_one() == 0


async def test_me_endpoint(team_client):
    r = await team_client.get("/api/v1/rewards/me")
    assert r.status_code == 200
    body = r.json()
    assert body["mp_per_ticket"] == 50 and body["max_tickets"] == 10
    assert {"pipeline", "table", "pot_rupees", "draw_at"} <= set(body)


async def test_admin_audit_is_admin_only(team_client):
    assert (await team_client.get("/api/v1/rewards/admin/points")).status_code == 403
    assert (await team_client.post("/api/v1/rewards/admin/points/1/revoke")).status_code == 403


async def test_admin_audit(admin_client):
    assert (await admin_client.get("/api/v1/rewards/admin/points")).json() == {"points": []}
    assert (await admin_client.get("/api/v1/rewards/admin/draws")).status_code == 200
    assert (await admin_client.post("/api/v1/rewards/admin/points/999/revoke")).status_code == 404
