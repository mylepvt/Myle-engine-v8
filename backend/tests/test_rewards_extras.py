"""Rewards phase 2: Power Hour, streak ×2, Team League, Season, scratch cards, badges."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.app_setting import AppSetting
from app.models.flp_min_billing_share_link import FlpMinBillingShareLink
from app.models.lead import Lead
from app.models.process_reward import ProcessPoint, ScratchCard
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services import process_rewards as pr
from app.services import rewards_extras as rx

# Team Aman: Aman (leader) + Priya + Rahul. Team Neha: Neha (leader) + Ravi. Admin outside.
AMAN, PRIYA, RAHUL, NEHA, RAVI, ADMIN = 1, 2, 3, 4, 5, 6
NOW = datetime.now(IST).replace(hour=15, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def _seed(s: AsyncSession) -> None:
    s.add_all([
        User(id=ADMIN, fbo_id="f6", email="ad@t", role="admin", name="Admin"),
        User(id=AMAN, fbo_id="f1", email="a@t", role="leader", name="Aman Gill", upline_user_id=ADMIN),
        User(id=NEHA, fbo_id="f4", email="n@t", role="leader", name="Neha", upline_user_id=ADMIN),
    ])
    await s.flush()
    s.add_all([
        User(id=PRIYA, fbo_id="f2", email="p@t", role="team", name="Priya", upline_user_id=AMAN),
        User(id=RAHUL, fbo_id="f3", email="r@t", role="team", name="Rahul", upline_user_id=AMAN),
        User(id=RAVI, fbo_id="f5", email="v@t", role="team", name="Ravi", upline_user_id=NEHA),
        AppSetting(key=pr.LAUNCH_KEY, value=(NOW - timedelta(days=60)).isoformat()),
    ])
    await s.flush()
    for i in range(1, 11):
        owner = (PRIYA, RAHUL, RAVI, AMAN, NEHA)[i % 5]
        s.add(Lead(id=i, name=f"P{i}", status="day1", created_by_user_id=owner, owner_user_id=owner,
                   assigned_to_user_id=owner, in_pool=False, call_count=0, phone=f"98000000{i:02d}",
                   created_at=NOW - timedelta(days=90)))
    await s.flush()


def _pt(uid: int, lead: int, step: str, pts: int, at: datetime, mult: int = 1) -> ProcessPoint:
    return ProcessPoint(user_id=uid, lead_id=lead, step=step, points=pts, created_at=at, multiplier=mult)


# ── Power Hour + streak ─────────────────────────────────────────────────────────


def test_power_hour_window():
    cfg = {"enabled": True, "start": "18:00", "end": "19:00"}
    day = datetime(2026, 10, 6, tzinfo=IST)
    assert pr.in_power_hour(cfg, day.replace(hour=18, minute=30))
    assert not pr.in_power_hour(cfg, day.replace(hour=19))
    assert not pr.in_power_hour({**cfg, "enabled": False}, day.replace(hour=18, minute=30))


async def test_power_hour_steps_count_double(Session):
    async with Session() as s:
        await _seed(s)
        await pr.save_power_hour_config(s, True, "14:00", "16:00")  # NOW is 15:00 IST
        s.add(FlpMinBillingShareLink(token="x", lead_id=5, created_by_user_id=PRIYA,
                                     first_viewed_at=NOW - timedelta(minutes=20), expires_at=NOW + timedelta(days=1)))
        await s.commit()
        await pr.scan(s, NOW)
        point = (await s.execute(select(ProcessPoint))).scalar_one()
        assert (point.points, point.multiplier) == (25, 2)
        start, end = pr.draw_window(pr.current_draw_date(NOW))
        assert (await pr.points_in_window(s, start, end))[PRIYA] == 50  # → 1 ticket


async def test_seven_day_streak_doubles_tickets(Session):
    d = pr.current_draw_date(NOW)
    async with Session() as s:
        await _seed(s)
        for back in range(7):  # Priya: 7 days in a row with a ticket
            s.add(_pt(PRIYA, 2, f"x{back}", 60, NOW - timedelta(days=back)))
        for back in (0, 1, 2, 4, 5, 6):  # Rahul missed a day
            s.add(_pt(RAHUL, 3, f"x{back}", 60, NOW - timedelta(days=back)))
        await s.commit()
        assert (await pr.streak_days(s, [PRIYA, RAHUL], d)) == {PRIYA: 7, RAHUL: 3}
        assert await pr.eligible_tickets(s, d) == {PRIYA: 2, RAHUL: 1}


# ── Team League ─────────────────────────────────────────────────────────────────


async def test_league_best_team_per_member_wins_and_contributors_split(Session):
    week = rx.week_start_for(NOW) - timedelta(days=7)
    mid = datetime.combine(week + timedelta(days=2), time(12), tzinfo=IST)
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _pt(PRIYA, 2, "a", 300, mid), _pt(RAHUL, 3, "a", 120, mid), _pt(AMAN, 4, "a", 30, mid),  # 450/3 = 150
            _pt(RAVI, 1, "a", 200, mid), _pt(NEHA, 5, "a", 50, mid),  # 250/2 = 125
            _pt(PRIYA, 6, "b", 999, mid - timedelta(days=8)),  # previous week — doesn't count
        ])
        await s.commit()
        table = await rx.league_standings(s, week)
        assert [(t["name"], t["score"]) for t in table] == [("Aman", 150.0), ("Neha", 125.0)]

        result = await rx.settle_league(s, week)
        assert result.winner_leader_id == AMAN
        assert result.payouts == [{"user_id": PRIYA, "cents": 25_000}, {"user_id": RAHUL, "cents": 25_000}]
        again = await rx.settle_league(s, week)
        assert again.id == result.id
        credits = (await s.execute(select(WalletLedgerEntry))).scalars().all()
        assert sorted((c.user_id, c.amount_cents) for c in credits) == [(PRIYA, 25_000), (RAHUL, 25_000)]
        assert await rx.league_pot(s, week + timedelta(days=7)) == 50_000


async def test_league_rolls_over_without_contributors(Session):
    week = rx.week_start_for(NOW) - timedelta(days=7)
    async with Session() as s:
        await _seed(s)
        s.add(_pt(PRIYA, 2, "a", 40, datetime.combine(week, time(12), tzinfo=IST)))  # under 100 MP
        await s.commit()
        result = await rx.settle_league(s, week)
        assert result.winner_leader_id is None and result.payouts == []
        assert await rx.league_pot(s, week + timedelta(days=7)) == 100_000


# ── Season ──────────────────────────────────────────────────────────────────────


async def test_season_top3_and_most_improved(Session):
    month = date(2026, 9, 1)
    this = datetime(2026, 9, 15, 12, tzinfo=IST)
    last = datetime(2026, 8, 15, 12, tzinfo=IST)
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _pt(PRIYA, 2, "a", 900, this), _pt(RAVI, 1, "a", 800, this), _pt(AMAN, 4, "a", 700, this),
            _pt(RAHUL, 3, "a", 600, this), _pt(NEHA, 5, "a", 500, this),
            _pt(RAHUL, 3, "b", 100, last), _pt(NEHA, 5, "b", 450, last), _pt(PRIYA, 2, "b", 10, last),
        ])
        await s.commit()
        st = await rx.season_standings(s, month)
        assert [(t["name"], t["prize_rupees"]) for t in st["top"][:3]] == [("Priya", 700), ("Ravi", 500), ("Aman", 300)]
        assert (st["most_improved"]["name"], st["most_improved"]["gain"]) == ("Rahul", 500)

        result = await rx.settle_season(s, month)
        assert [w["user_id"] for w in result.winners] == [PRIYA, RAVI, AMAN, RAHUL]
        paid = await rx.mark_season_paid(s, month, RAHUL, True, NOW)
        assert next(w for w in paid.winners if w["user_id"] == RAHUL)["paid_at"] is not None


# ── Scratch cards ───────────────────────────────────────────────────────────────


async def test_scratch_cards_granted_paid_and_capped(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _pt(PRIYA, 2, "enrolled", 50, NOW), _pt(PRIYA, 7, "converted", 150, NOW),
            _pt(PRIYA, 3, "video_watched", 25, NOW),  # no card for this
        ])
        await s.commit()
        assert await rx.grant_scratch_cards(s, NOW) == 2
        assert await rx.grant_scratch_cards(s, NOW) == 0
        cards = (await s.execute(select(ScratchCard).order_by(ScratchCard.id))).scalars().all()

        with pytest.raises(rx.ScratchError):
            await rx.scratch(s, cards[0].id, RAHUL, NOW)  # not his card

        top = sum(w for _, w in rx.SCRATCH_TABLE) - 1  # roll the ₹50 slot
        won = await rx.scratch(s, cards[0].id, PRIYA, NOW, lambda n: top)
        assert (won.amount_cents, won.bonus_points) == (5_000, 0)
        again = await rx.scratch(s, cards[0].id, PRIYA, NOW, lambda n: top)
        assert again.amount_cents == 5_000  # scratching twice changes nothing

        # Today's ₹50 budget is gone → bonus MP instead of money.
        capped = await rx.scratch(s, cards[1].id, PRIYA, NOW, lambda n: top)
        assert (capped.amount_cents, capped.bonus_points) == (0, rx.SCRATCH_CONSOLATION_MP)
        credits = (await s.execute(select(WalletLedgerEntry))).scalars().all()
        assert [(c.user_id, c.amount_cents, c.idempotency_key) for c in credits] == [(PRIYA, 5_000, f"scratch:{cards[0].id}")]
        bonus = (await s.execute(select(ProcessPoint).where(ProcessPoint.step.like("scratch:%")))).scalar_one()
        assert bonus.points == rx.SCRATCH_CONSOLATION_MP

        # The scanner never revokes bonus points.
        await pr.scan(s, NOW + timedelta(minutes=10))
        await s.refresh(bonus)
        assert bonus.revoked_at is None


async def test_scratch_card_void_when_step_undone(Session):
    async with Session() as s:
        await _seed(s)
        point = _pt(PRIYA, 2, "enrolled", 50, NOW)
        s.add(point)
        await s.commit()
        await rx.grant_scratch_cards(s, NOW)
        card = (await s.execute(select(ScratchCard))).scalar_one()
        point.revoked_at = NOW
        await s.commit()
        with pytest.raises(rx.ScratchError):
            await rx.scratch(s, card.id, PRIYA, NOW)
        await s.refresh(card)
        assert card.void_at is not None and card.amount_cents == 0


def test_scratch_table_budget_is_sane():
    total = sum(w for _, w in rx.SCRATCH_TABLE)
    ev = sum(r * w for r, w in rx.SCRATCH_TABLE) / total
    assert ev < 10  # ~₹7.75 a card
    assert rx.draw_scratch_rupees(lambda n: 0) == 0


# ── Badges + /me ────────────────────────────────────────────────────────────────


async def test_badges_and_my_extras(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([_pt(PRIYA, 2, "enrolled", 50, NOW), _pt(PRIYA, 7, "converted", 150, NOW)])
        await s.commit()
        priya = await s.get(User, PRIYA)
        base = await pr.my_rewards(s, priya, NOW)
        assert base["streak"] == {"days": 1, "goal": 7, "doubled": False}
        extras = await rx.my_extras(s, priya, base, NOW)
        earned = {b["key"] for b in extras["badges"] if b["earned"]}
        assert earned == {"first_enroll", "closer"}
        assert extras["league"]["my_team"]["name"] == "Aman"
        assert extras["season"]["my_rank"] == 1


async def test_me_endpoint_includes_extras(team_client):
    body = (await team_client.get("/api/v1/rewards/me")).json()
    assert {"league", "season", "scratch_cards", "badges", "streak", "power_hour"} <= set(body)


async def test_admin_power_hour(admin_client):
    r = await admin_client.put("/api/v1/rewards/admin/power-hour", json={"enabled": True, "start": "19:00", "end": "20:00"})
    assert r.json() == {"enabled": True, "start": "19:00", "end": "20:00"}
    bad = await admin_client.put("/api/v1/rewards/admin/power-hour", json={"enabled": True, "start": "20:00", "end": "19:00"})
    assert bad.status_code == 400
    overview = (await admin_client.get("/api/v1/rewards/admin/overview")).json()
    assert overview["power_hour"]["start"] == "19:00"
    assert overview["scratch"]["daily_cap_rupees"] == 50


async def test_admin_endpoints_need_admin(team_client):
    assert (await team_client.get("/api/v1/rewards/admin/overview")).status_code == 403
    assert (await team_client.put("/api/v1/rewards/admin/power-hour",
                                  json={"enabled": False, "start": "18:00", "end": "19:00"})).status_code == 403
    assert (await team_client.post("/api/v1/rewards/scratch/999")).status_code == 400
