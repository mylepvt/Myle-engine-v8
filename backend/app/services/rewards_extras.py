"""Rewards phase 2 — Team League, Monthly Season, scratch cards, badges.

Budget (₹10,000 / month together with the ₹150/day jackpot):
- Team League ₹500 / week → wallet credit, split equally among the winning team's
  contributors (≥ LEAGUE_MIN_MP that week). Teams = a leader + everyone whose nearest
  leader they are. Score = MP per member, so small teams can win too.
- Season ₹2,000 / month → top 3 (₹700 / ₹500 / ₹300) + Most Improved (₹500). Paid by the
  admin (cash / gift); the app records winners and "paid".
- Scratch cards ₹1,500 / month, max ₹50 a day (all members together) → wallet credit.
  Earned on enrollment, Day 2 test pass and closing. Out of budget → bonus MP instead.

All scores use effective MP (Power Hour steps count double) from ``process_points``.
"""

from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.person_name import person_name
from app.core.time_ist import IST
from app.models.lead import Lead
from app.models.process_reward import JackpotDraw, LeagueWeek, ProcessPoint, ScratchCard, SeasonResult
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.services import process_rewards as pr
from app.services.user_hierarchy import load_user_hierarchy_entries, nearest_leader_entry

# ── Team League ─────────────────────────────────────────────────────────────────
LEAGUE_POT_CENTS = 50_000  # ₹500 / week
LEAGUE_MIN_MP = 100  # to share the prize
LEAGUE_MIN_MEMBERS = 2  # a leader alone is not a team

# ── Season ──────────────────────────────────────────────────────────────────────
SEASON_PRIZES = (700, 500, 300)
IMPROVED_PRIZE = 500
IMPROVED_MIN_PREV = 50  # last month's MP needed to count as "improved"

# ── Scratch cards ───────────────────────────────────────────────────────────────
SCRATCH_STEPS = ("enrolled", "day2_test_passed", "converted")
SCRATCH_DAILY_CAP_CENTS = 5_000  # ₹50 / day for everyone together
SCRATCH_MONTHLY_CAP_CENTS = 150_000  # ₹1,500 / month
# (rupees, weight) — expected value ≈ ₹7.75 a card
SCRATCH_TABLE = ((0, 40), (5, 25), (10, 20), (20, 10), (50, 5))
SCRATCH_CONSOLATION_MP = 5  # "better luck" / out of budget


def _aware(dt: datetime | None) -> datetime | None:
    return pr._aware(dt)


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=IST)


def week_start_for(now: datetime) -> date:
    local = _aware(now).astimezone(IST).date()
    return local - timedelta(days=local.weekday())  # Monday


def month_start_for(now: datetime) -> date:
    return _aware(now).astimezone(IST).date().replace(day=1)


def _next_month(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def _prev_month(d: date) -> date:
    return (d.replace(day=1) - timedelta(days=1)).replace(day=1)


async def _eligible_users(session: AsyncSession, ids) -> dict[int, User]:
    ids = [i for i in ids if i is not None]
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(User).where(User.id.in_(ids), User.role.in_(pr.EARNING_ROLES), User.removed_at.is_(None))
        )
    ).scalars().all()
    return {u.id: u for u in rows}


# ── Team League ─────────────────────────────────────────────────────────────────


async def league_standings(session: AsyncSession, week_start: date) -> list[dict]:
    """Teams best first: {leader_id, name, members, points, score, member_points}."""
    start = _day_start(week_start)
    points = await pr.points_in_window(session, start, start + timedelta(days=7))
    members = (
        await session.execute(
            select(User.id).where(User.role.in_(pr.EARNING_ROLES), User.removed_at.is_(None))
        )
    ).scalars().all()
    entries = await load_user_hierarchy_entries(session, members)
    teams: dict[int, list[int]] = defaultdict(list)
    for uid in members:
        leader = nearest_leader_entry(uid, entries)
        if leader is not None:
            teams[leader.id].append(uid)
    out = []
    for leader_id, uids in teams.items():
        if len(uids) < LEAGUE_MIN_MEMBERS:
            continue
        total = sum(points.get(u, 0) for u in uids)
        out.append(
            {
                "leader_id": leader_id,
                "name": pr._name_from_entry(entries.get(leader_id)),
                "members": len(uids),
                "points": total,
                "score": round(total / len(uids), 1),
                "member_points": {str(u): points.get(u, 0) for u in uids},
            }
        )
    out.sort(key=lambda t: (-t["score"], -t["points"], t["leader_id"]))
    return out


async def league_pot(session: AsyncSession, week_start: date) -> int:
    prev = (
        await session.execute(
            select(LeagueWeek).where(LeagueWeek.week_start < week_start).order_by(LeagueWeek.week_start.desc()).limit(1)
        )
    ).scalar_one_or_none()
    carry = prev.pot_cents if prev is not None and not prev.payouts else 0
    return LEAGUE_POT_CENTS + carry


async def settle_league(session: AsyncSession, week_start: date) -> LeagueWeek:
    """Close a finished week once (idempotent); pay the winning team's contributors."""
    done = (await session.execute(select(LeagueWeek).where(LeagueWeek.week_start == week_start))).scalar_one_or_none()
    if done is not None:
        return done
    standings = await league_standings(session, week_start)
    pot = await league_pot(session, week_start)
    payouts: list[dict] = []
    winner = None
    for team in standings:
        if team["points"] <= 0:
            break
        contributors = sorted(
            (int(u) for u, p in team["member_points"].items() if p >= LEAGUE_MIN_MP),
            key=lambda u: -team["member_points"][str(u)],
        )
        if contributors:
            winner = team
            share, extra = divmod(pot, len(contributors))
            payouts = [{"user_id": u, "cents": share + (extra if i == 0 else 0)} for i, u in enumerate(contributors)]
        break  # only the top team can win; no contributors → the pot rolls over
    week = LeagueWeek(
        week_start=week_start,
        pot_cents=pot,
        winner_leader_id=winner["leader_id"] if winner else None,
        standings=[{k: v for k, v in t.items() if k != "member_points"} for t in standings[:10]],
        payouts=payouts,
    )
    session.add(week)
    for p in payouts:
        session.add(
            WalletLedgerEntry(
                user_id=p["user_id"],
                amount_cents=p["cents"],
                currency="INR",
                idempotency_key=f"league:{week_start.isoformat()}:{p['user_id']}",
                note=f"MYLE Team League week of {week_start.isoformat()} — team {winner['name']}",
                created_by_user_id=None,
            )
        )
    await session.commit()
    return week


# ── Season ──────────────────────────────────────────────────────────────────────


async def season_points(session: AsyncSession, month: date) -> dict[int, int]:
    pts = await pr.points_in_window(session, _day_start(month), _day_start(_next_month(month)))
    ok = await _eligible_users(session, list(pts))
    return {u: p for u, p in pts.items() if u in ok and p > 0}


async def season_standings(session: AsyncSession, month: date) -> dict:
    now_pts = await season_points(session, month)
    prev_pts = await season_points(session, _prev_month(month))
    users = await _eligible_users(session, list(now_pts))
    ranked = sorted(now_pts.items(), key=lambda kv: (-kv[1], kv[0]))
    top = [
        {"rank": i + 1, "user_id": uid, "name": pr._name(users.get(uid)), "points": p,
         "prize_rupees": SEASON_PRIZES[i] if i < len(SEASON_PRIZES) else 0}
        for i, (uid, p) in enumerate(ranked)
    ]
    winners = {t["user_id"] for t in top[: len(SEASON_PRIZES)]}
    improved = None
    best = 0
    for uid, p in now_pts.items():
        before = prev_pts.get(uid, 0)
        if uid in winners or before < IMPROVED_MIN_PREV:
            continue
        gain = p - before
        if gain > best:
            best, improved = gain, {"user_id": uid, "name": pr._name(users.get(uid)), "points": p,
                                     "gain": gain, "prize_rupees": IMPROVED_PRIZE}
    return {"month": month.isoformat(), "top": top, "most_improved": improved}


async def settle_season(session: AsyncSession, month: date) -> SeasonResult:
    done = (await session.execute(select(SeasonResult).where(SeasonResult.month == month))).scalar_one_or_none()
    if done is not None:
        return done
    st = await season_standings(session, month)
    winners = [
        {"kind": "rank", "rank": t["rank"], "user_id": t["user_id"], "name": t["name"], "points": t["points"],
         "prize_rupees": t["prize_rupees"], "paid_at": None}
        for t in st["top"][: len(SEASON_PRIZES)]
    ]
    if st["most_improved"]:
        mi = st["most_improved"]
        winners.append({"kind": "improved", "rank": None, "user_id": mi["user_id"], "name": mi["name"],
                        "points": mi["points"], "gain": mi["gain"], "prize_rupees": mi["prize_rupees"],
                        "paid_at": None})
    result = SeasonResult(month=month, winners=winners)
    session.add(result)
    await session.commit()
    return result


async def mark_season_paid(session: AsyncSession, month: date, user_id: int, paid: bool, now: datetime) -> SeasonResult | None:
    result = (await session.execute(select(SeasonResult).where(SeasonResult.month == month))).scalar_one_or_none()
    if result is None:
        return None
    winners = [dict(w) for w in result.winners]
    for w in winners:
        if w["user_id"] == user_id:
            w["paid_at"] = _aware(now).isoformat() if paid else None
    result.winners = winners  # reassign so the JSON change is saved
    await session.commit()
    return result


# ── Scratch cards ───────────────────────────────────────────────────────────────


async def grant_scratch_cards(session: AsyncSession, now: datetime) -> int:
    """One card per live enrollment / Day 2 pass / closing point. Commits."""
    have = select(ScratchCard.id).where(
        ScratchCard.lead_id == ProcessPoint.lead_id, ScratchCard.source_step == ProcessPoint.step
    ).exists()
    rows = (
        await session.execute(
            select(ProcessPoint.user_id, ProcessPoint.lead_id, ProcessPoint.step).where(
                ProcessPoint.step.in_(SCRATCH_STEPS),
                ProcessPoint.revoked_at.is_(None),
                ProcessPoint.created_at >= _aware(now) - timedelta(days=30),
                ~have,
            )
        )
    ).all()
    made = 0
    for uid, lead_id, step in rows:
        try:
            async with session.begin_nested():
                session.add(ScratchCard(user_id=uid, lead_id=lead_id, source_step=step, created_at=_aware(now)))
            made += 1
        except IntegrityError:
            continue
    await session.commit()
    return made


async def scratch_spent(session: AsyncSession, now: datetime) -> tuple[int, int]:
    """(paid today, paid this month) in paise."""
    today = _day_start(_aware(now).astimezone(IST).date())
    month = _day_start(month_start_for(now))

    async def total(since: datetime) -> int:
        return int(
            (
                await session.execute(
                    select(func.coalesce(func.sum(ScratchCard.amount_cents), 0)).where(ScratchCard.scratched_at >= since)
                )
            ).scalar_one()
        )

    return await total(today), await total(month)


def draw_scratch_rupees(rand_below=secrets.randbelow) -> int:
    total = sum(w for _, w in SCRATCH_TABLE)
    roll = rand_below(total)
    for rupees, weight in SCRATCH_TABLE:
        roll -= weight
        if roll < 0:
            return rupees
    return 0


class ScratchError(Exception):
    pass


async def scratch(session: AsyncSession, card_id: int, user_id: int, now: datetime, rand_below=secrets.randbelow) -> ScratchCard:
    """Reveal a card (server decides the prize). Commits."""
    card = await session.get(ScratchCard, card_id, with_for_update=True)
    if card is None or card.user_id != user_id:
        raise ScratchError("Card not found")
    if card.scratched_at is not None or card.void_at is not None:
        return card
    source = (
        await session.execute(
            select(ProcessPoint).where(ProcessPoint.lead_id == card.lead_id, ProcessPoint.step == card.source_step)
        )
    ).scalar_one_or_none()
    now = _aware(now)
    if source is None or source.revoked_at is not None:
        card.void_at = now
        await session.commit()
        raise ScratchError("This card is no longer valid — the step behind it was undone")

    rupees = draw_scratch_rupees(rand_below)
    cents = rupees * 100
    if cents:
        day_spent, month_spent = await scratch_spent(session, now)
        if day_spent + cents > SCRATCH_DAILY_CAP_CENTS or month_spent + cents > SCRATCH_MONTHLY_CAP_CENTS:
            cents = 0  # budget used up → bonus MP instead
    card.scratched_at = now
    card.amount_cents = cents
    card.bonus_points = 0 if cents else SCRATCH_CONSOLATION_MP
    if cents:
        session.add(
            WalletLedgerEntry(
                user_id=user_id,
                amount_cents=cents,
                currency="INR",
                idempotency_key=f"scratch:{card.id}",
                note=f"MYLE scratch card #{card.id} — ₹{cents // 100}",
                created_by_user_id=None,
            )
        )
    else:
        session.add(
            ProcessPoint(user_id=user_id, lead_id=card.lead_id, step=f"scratch:{card.id}",
                         points=SCRATCH_CONSOLATION_MP, created_at=now)
        )
    await session.commit()
    return card


async def my_scratch_cards(session: AsyncSession, user_id: int) -> list[dict]:
    rows = (
        await session.execute(
            select(ScratchCard, Lead.name)
            .join(Lead, Lead.id == ScratchCard.lead_id)
            .where(ScratchCard.user_id == user_id, ScratchCard.void_at.is_(None))
            .order_by(ScratchCard.scratched_at.is_not(None), ScratchCard.created_at.desc())
            .limit(10)
        )
    ).all()
    return [
        {
            "id": c.id,
            "source": pr.label_for(c.source_step),
            "lead_name": name,
            "scratched": c.scratched_at is not None,
            "amount_rupees": c.amount_cents // 100,
            "bonus_points": c.bonus_points,
        }
        for c, name in rows
    ]


# ── Badges ──────────────────────────────────────────────────────────────────────


async def badges(session: AsyncSession, user_id: int, streak: int, points_total: int) -> list[dict]:
    steps = set(
        (
            await session.execute(
                select(ProcessPoint.step)
                .where(ProcessPoint.user_id == user_id, ProcessPoint.revoked_at.is_(None),
                       ProcessPoint.step.in_(("enrolled", "converted", "day2_test_passed")))
                .distinct()
            )
        ).scalars().all()
    )
    won_jackpot = (
        await session.execute(select(func.count(JackpotDraw.id)).where(JackpotDraw.winner_user_id == user_id))
    ).scalar_one()
    league_rows = (await session.execute(select(LeagueWeek.payouts))).scalars().all()
    league_champ = any(any(p.get("user_id") == user_id for p in (rows or [])) for rows in league_rows)
    season_rows = (await session.execute(select(SeasonResult.winners))).scalars().all()
    season_star = any(any(w.get("user_id") == user_id for w in (rows or [])) for rows in season_rows)
    out = [
        ("first_enroll", "First Enrollment", "enrolled" in steps),
        ("test_coach", "Day 2 Coach", "day2_test_passed" in steps),
        ("closer", "Closer", "converted" in steps),
        ("streak", f"{pr.STREAK_DAYS}-Day Streak", streak >= pr.STREAK_DAYS),
        ("club_1k", "1K MP Club", points_total >= 1000),
        ("jackpot", "Jackpot Winner", won_jackpot > 0),
        ("league", "League Champion", league_champ),
        ("season", "Season Star", season_star),
    ]
    return [{"key": k, "label": label, "earned": bool(e)} for k, label, e in out]


def _trim_season(st: dict) -> dict:
    return {**st, "top": st["top"][:10]}


# ── Read model for /rewards/me ──────────────────────────────────────────────────


async def my_extras(session: AsyncSession, user: User, base: dict, now: datetime | None = None) -> dict:
    now = _aware(now or datetime.now(timezone.utc))
    week = week_start_for(now)
    standings = await league_standings(session, week)
    entries = await load_user_hierarchy_entries(session, [user.id])
    my_leader = nearest_leader_entry(user.id, entries)
    mine = next((t for t in standings if my_leader and t["leader_id"] == my_leader.id), None)
    month = month_start_for(now)
    season = await season_standings(session, month)
    me_rank = next((t for t in season["top"] if t["user_id"] == user.id), None)
    return {
        "league": {
            "week_start": week.isoformat(),
            "ends_at": _day_start(week + timedelta(days=7)).isoformat(),
            "pot_rupees": (await league_pot(session, week)) // 100,
            "min_mp": LEAGUE_MIN_MP,
            "my_team": (
                {"name": mine["name"], "rank": standings.index(mine) + 1, "score": mine["score"],
                 "my_points": mine["member_points"].get(str(user.id), 0)}
                if mine else None
            ),
            "top": [{"name": t["name"], "score": t["score"], "members": t["members"]} for t in standings[:3]],
        },
        "season": {
            "month": season["month"],
            "my_rank": me_rank["rank"] if me_rank else None,
            "my_points": me_rank["points"] if me_rank else 0,
            "top": [{k: t[k] for k in ("rank", "name", "points", "prize_rupees")} for t in season["top"][:3]],
            "most_improved": (
                {k: season["most_improved"][k] for k in ("name", "gain", "prize_rupees")}
                if season["most_improved"] else None
            ),
        },
        "scratch_cards": await my_scratch_cards(session, user.id),
        "badges": await badges(session, user.id, base["streak"]["days"], base["points_total"]),
    }


async def admin_overview(session: AsyncSession, now: datetime | None = None) -> dict:
    now = _aware(now or datetime.now(timezone.utc))
    day_spent, month_spent = await scratch_spent(session, now)
    weeks = (
        await session.execute(select(LeagueWeek).order_by(LeagueWeek.week_start.desc()).limit(8))
    ).scalars().all()
    seasons = (
        await session.execute(select(SeasonResult).order_by(SeasonResult.month.desc()).limit(6))
    ).scalars().all()
    names = {
        u.id: pr._name(u)
        for u in (
            await session.execute(
                select(User).where(User.id.in_([w.winner_leader_id for w in weeks if w.winner_leader_id] or [-1]))
            )
        ).scalars().all()
    }
    return {
        "power_hour": await pr.power_hour_config(session),
        "scratch": {
            "today_rupees": day_spent // 100,
            "month_rupees": month_spent // 100,
            "daily_cap_rupees": SCRATCH_DAILY_CAP_CENTS // 100,
            "monthly_cap_rupees": SCRATCH_MONTHLY_CAP_CENTS // 100,
        },
        "league": [
            {
                "week_start": w.week_start.isoformat(),
                "pot_rupees": w.pot_cents // 100,
                "winner": names.get(w.winner_leader_id),
                "paid_to": len(w.payouts or []),
            }
            for w in weeks
        ],
        "league_live": [
            {k: t[k] for k in ("name", "members", "points", "score")}
            for t in await league_standings(session, week_start_for(now))
        ][:10],
        "seasons": [{"month": s.month.isoformat(), "winners": s.winners} for s in seasons],
        "season_live": _trim_season(await season_standings(session, month_start_for(now))),
    }


# ── Admin: points per member ────────────────────────────────────────────────────


async def member_totals(session: AsyncSession, now: datetime) -> list[dict]:
    """Every active team member / leader: effective MP today, this week and this month,
    what this month's points came for, and when they last earned. Highest month first."""
    now = _aware(now)
    today, week, month = _day_start(now.astimezone(IST).date()), _day_start(week_start_for(now)), _day_start(month_start_for(now))
    since = min(week, month)
    users = (
        await session.execute(
            select(User).where(User.role.in_(pr.EARNING_ROLES), User.removed_at.is_(None))
        )
    ).scalars().all()
    rows = (
        await session.execute(
            select(ProcessPoint.user_id, ProcessPoint.step, ProcessPoint.points * ProcessPoint.multiplier, ProcessPoint.created_at)
            .where(ProcessPoint.created_at >= since, ProcessPoint.revoked_at.is_(None))
        )
    ).all()
    stats: dict[int, dict] = {
        u.id: {"today": 0, "week": 0, "month": 0, "steps": defaultdict(lambda: [0, 0]), "last_at": None} for u in users
    }
    for uid, step, pts, at in rows:
        s = stats.get(uid)
        if s is None:
            continue
        at = _aware(at)
        if at >= today:
            s["today"] += pts
        if at >= week:
            s["week"] += pts
        if at >= month:
            s["month"] += pts
            label = pr.label_for(step)
            s["steps"][label][0] += 1
            s["steps"][label][1] += pts
        if s["last_at"] is None or at > s["last_at"]:
            s["last_at"] = at
    entries = await load_user_hierarchy_entries(session, [u.id for u in users])
    out = []
    for u in users:
        s = stats[u.id]
        leader = nearest_leader_entry(u.id, entries) if u.role != "leader" else None
        out.append({
            "user_id": u.id,
            "name": person_name(u.name or u.username or u.fbo_id),
            "role": u.role,
            "leader_name": person_name(leader.display_name) if leader else None,
            "today": s["today"],
            "week": s["week"],
            "month": s["month"],
            "last_at": s["last_at"].isoformat() if s["last_at"] else None,
            "breakdown": [
                {"label": label, "count": c, "points": p}
                for label, (c, p) in sorted(s["steps"].items(), key=lambda kv: -kv[1][1])
            ],
        })
    out.sort(key=lambda m: (-m["month"], -m["week"], m["name"].lower()))
    return out
