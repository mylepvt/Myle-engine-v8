"""Process rewards — MYLE Points (MP) for verified process steps + the daily ₹150 jackpot.

How it works
- A scanner (every 10 min) looks at fresh *proof* and awards MP to the lead's owner.
- Every step pays once per lead: ``process_points`` is unique on (lead_id, step).
- Points never become money directly: 50 MP = 1 jackpot ticket, max 10 tickets a day.
- 21:00 IST: one weighted random draw (``secrets``) → ₹150 wallet credit to the winner.
  No tickets → no winner, the pot rolls over to tomorrow.

Cheat-proofing — a step only counts when someone other than the member proves it:
- Enrollment (₹149–200): the payment screenshot, once the leader accepted it (worked the
  lead, or 6h passed without a send-back). A send-back clears the proof → points revoked.
- Video / batches / Day 2 test: the *prospect* opened their personal link (number gate)
  or passed the locked test. Batch links can only be made by a leader/admin.
- Mindset and Day 3 ticks: must be ticked by someone else (the leader), never self.
- Day 3 steps, stage and closing also need the prospect's passed Day 2 test.
- Calls are self-logged, so call + video points are capped at EARLY_DAILY_CAP a day
  and only count on the day they happen.
- No points on a lead with the member's own phone number; admins and removed
  members never earn. Proof that disappears (lead deleted, batch unticked, enrollment
  rejected …) revokes the points on the next scan. Admin can revoke any line.
- Nothing before launch counts (``rewards.launched_at``), so old history can't be farmed.
"""

from __future__ import annotations

import re
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog
from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.call_event import CallEvent
from app.models.day2_test_session import Day2TestSession
from app.models.flp_min_billing_share_link import FlpMinBillingShareLink
from app.models.lead import Lead
from app.models.process_reward import JackpotDraw, ProcessPoint
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry

# ── Points table ────────────────────────────────────────────────────────────────
POINTS: dict[str, int] = {
    "fast_first_call": 5,
    "connected_call": 2,  # once per lead per day
    "video_watched": 25,  # invitation (10) + Day 1 video watched (15)
    "enrolled": 50,  # ₹149–200 enrollment payment — the first closing
    "mindset_complete": 20,
    "d1_morning": 10,
    "d1_afternoon": 10,
    "d1_evening": 10,
    "d1_all": 15,
    "d2_morning": 10,
    "d2_afternoon": 10,
    "d2_evening": 10,
    "d2_all": 15,
    "day2_test_passed": 30,
    "day3_interview": 25,
    "day3_2cc": 25,
    "day3_blueprint": 25,
    "stage_selected": 50,
    "converted": 150,
}
LABELS: dict[str, str] = {
    "fast_first_call": "First call within 2h of claim",
    "connected_call": "Connected call",
    "video_watched": "Prospect watched the Day 1 video",
    "enrolled": "Enrollment payment (first closing)",
    "mindset_complete": "Mindset complete",
    "d1_morning": "Day 1 morning batch",
    "d1_afternoon": "Day 1 afternoon batch",
    "d1_evening": "Day 1 evening batch",
    "d1_all": "All 3 Day 1 batches bonus",
    "d2_morning": "Day 2 morning batch",
    "d2_afternoon": "Day 2 afternoon batch",
    "d2_evening": "Day 2 evening batch",
    "d2_all": "All 3 Day 2 batches bonus",
    "day2_test_passed": "Day 2 test passed",
    "day3_interview": "Day 3 interview",
    "day3_2cc": "Day 3 2CC session",
    "day3_blueprint": "Day 3 blueprint video",
    "stage_selected": "Stage selected",
    "converted": "Closing — converted",
}
# Self-logged steps: capped per day, only count on the day they happen, never revoked by proof checks.
EARLY_STEPS = frozenset({"fast_first_call", "connected_call", "video_watched"})
CALL_STEPS = frozenset({"fast_first_call", "connected_call"})
EARLY_DAILY_CAP = 100

MP_PER_TICKET = 50
MAX_TICKETS_PER_DAY = 10
DAILY_POT_CENTS = 15_000  # ₹150
DRAW_TIME = time(21, 0)
EARNING_ROLES = ("team", "leader")

CONNECTED_OUTCOMES = ("answered", "callback_requested")
FAST_CALL_WINDOW = timedelta(hours=2)
SCAN_LOOKBACK = timedelta(days=3)
REVOKE_LOOKBACK = timedelta(days=30)
LAUNCH_KEY = "rewards.launched_at"

# Day 3 workboard tick (process_tracking key) → reward step.
DAY3_TICKS = {
    "day3_interview": "day3_interview",
    "day3_live_session": "day3_2cc",
    "day3_blueprint_video": "day3_blueprint",
}
STAGE_TICK = "day3_stage_selection"
BATCH_SLOTS = ("d1_morning", "d1_afternoon", "d1_evening", "d2_morning", "d2_afternoon", "d2_evening")

# Pipeline meter: what the member earns when the prospect joins, per stage (track).
JOINING_INCOME_RUPEES = {"stage1": 1_500, "stage2": 4_500, "stage3": 7_000}
DEFAULT_JOINING_INCOME = 1_500
PIPELINE_STATUSES = (
    "invited", "whatsapp_sent", "video_sent", "video_watched", "day1", "day2", "day3",
)
AT_RISK_AFTER = timedelta(hours=24)

# Enrollment pays once the leader has accepted the payment screenshot: the leader worked
# the lead (mindset / a batch) or ENROLL_CONFIRM_AFTER passed without a send-back.
ENROLL_CONFIRM_AFTER = timedelta(hours=6)
ENROLLED_STATUSES = frozenset({"day1", "mindset_lock", "day2", "day3", "converted", "training"})


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _ist_date(dt: datetime) -> date:
    return _aware(dt).astimezone(IST).date()


def _digits10(raw: str | None) -> str:
    d = re.sub(r"\D", "", raw or "")
    return d[-10:] if len(d) >= 10 else ""


def base_step(step: str) -> str:
    return step.split(":", 1)[0]


def label_for(step: str) -> str:
    return LABELS.get(base_step(step), step)


# ── Draw windows ────────────────────────────────────────────────────────────────


def draw_window(draw_date: date) -> tuple[datetime, datetime]:
    """Points that count for ``draw_date``: yesterday 21:00 IST → today 21:00 IST."""
    end = datetime.combine(draw_date, DRAW_TIME, tzinfo=IST)
    return end - timedelta(days=1), end


def current_draw_date(now: datetime) -> date:
    local = _aware(now).astimezone(IST)
    return local.date() if local.time() < DRAW_TIME else local.date() + timedelta(days=1)


def tickets_for(points: int) -> int:
    return min(MAX_TICKETS_PER_DAY, max(0, points) // MP_PER_TICKET)


# ── Launch cutoff ───────────────────────────────────────────────────────────────


async def launched_at(session: AsyncSession, now: datetime) -> datetime:
    row = await session.get(AppSetting, LAUNCH_KEY)
    if row is not None and row.value:
        try:
            return _aware(datetime.fromisoformat(row.value))
        except ValueError:
            pass
    stamp = _aware(now)
    if row is None:
        session.add(AppSetting(key=LAUNCH_KEY, value=stamp.isoformat()))
    else:
        row.value = stamp.isoformat()
    await session.flush()
    return stamp


# ── Proof → steps ───────────────────────────────────────────────────────────────


@dataclass
class _Proofs:
    flp_views: dict[int, datetime]
    batches: dict[int, dict[str, datetime]]
    test_passed: dict[int, datetime]
    ticks: dict[int, list[tuple[str, int, datetime]]]  # lead → (task, actor, at)
    claims: dict[int, list[tuple[int, datetime]]]  # lead → (claimer, at)
    calls: dict[int, list[tuple[int, str, datetime]]]  # lead → (user, outcome, at)


async def _candidate_lead_ids(session: AsyncSession, since: datetime, now: datetime) -> set[int]:
    queries = [
        select(BatchShareLink.lead_id).where(BatchShareLink.used.is_(True), BatchShareLink.used_at >= since),
        select(FlpMinBillingShareLink.lead_id).where(FlpMinBillingShareLink.first_viewed_at >= since),
        select(Day2TestSession.lead_id).where(Day2TestSession.passed.is_(True), Day2TestSession.submitted_at >= since),
        select(ActivityLog.entity_id).where(
            ActivityLog.action == "process.task_done", ActivityLog.entity_type == "lead", ActivityLog.created_at >= since
        ),
        select(Lead.id).where(Lead.mindset_completed_at >= since),
        select(Lead.id).where(Lead.enrollment_proof_uploaded_at >= since),
        select(Lead.id).where(Lead.day3_completed_at >= since),
        select(CallEvent.lead_id).where(CallEvent.called_at >= since),
        select(ProcessPoint.lead_id).where(
            ProcessPoint.revoked_at.is_(None), ProcessPoint.created_at >= now - REVOKE_LOOKBACK
        ),
    ]
    ids: set[int] = set()
    for q in queries:
        ids.update(int(i) for i in (await session.execute(q.distinct())).scalars().all() if i is not None)
    return ids


async def _load_proofs(session: AsyncSession, ids: list[int], launch: datetime) -> _Proofs:
    flp: dict[int, datetime] = {}
    for lead_id, at in (
        await session.execute(
            select(FlpMinBillingShareLink.lead_id, FlpMinBillingShareLink.first_viewed_at).where(
                FlpMinBillingShareLink.lead_id.in_(ids), FlpMinBillingShareLink.first_viewed_at >= launch
            )
        )
    ).all():
        at = _aware(at)
        if lead_id not in flp or at < flp[lead_id]:
            flp[lead_id] = at

    batches: dict[int, dict[str, datetime]] = defaultdict(dict)
    for lead_id, slot, at in (
        await session.execute(
            select(BatchShareLink.lead_id, BatchShareLink.slot, BatchShareLink.used_at).where(
                BatchShareLink.lead_id.in_(ids), BatchShareLink.used.is_(True), BatchShareLink.used_at >= launch
            )
        )
    ).all():
        batches[lead_id].setdefault(slot, _aware(at))

    test_passed: dict[int, datetime] = {}
    for lead_id, at in (
        await session.execute(
            select(Day2TestSession.lead_id, Day2TestSession.submitted_at).where(
                Day2TestSession.lead_id.in_(ids), Day2TestSession.passed.is_(True), Day2TestSession.submitted_at >= launch
            )
        )
    ).all():
        test_passed.setdefault(lead_id, _aware(at))

    ticks: dict[int, list[tuple[str, int, datetime]]] = defaultdict(list)
    claims: dict[int, list[tuple[int, datetime]]] = defaultdict(list)
    for lead_id, action, actor, meta, at in (
        await session.execute(
            select(
                ActivityLog.entity_id, ActivityLog.action, ActivityLog.user_id, ActivityLog.meta, ActivityLog.created_at
            ).where(
                ActivityLog.entity_type == "lead",
                ActivityLog.entity_id.in_(ids),
                ActivityLog.action.in_(("process.task_done", "lead.claimed")),
            )
        )
    ).all():
        if action == "lead.claimed":
            claims[int(lead_id)].append((actor, _aware(at)))
        elif _aware(at) >= launch:
            ticks[int(lead_id)].append(((meta or {}).get("task") or "", actor, _aware(at)))

    calls: dict[int, list[tuple[int, str, datetime]]] = defaultdict(list)
    for lead_id, user_id, outcome, at in (
        await session.execute(
            select(CallEvent.lead_id, CallEvent.user_id, CallEvent.outcome, CallEvent.called_at)
            .where(CallEvent.lead_id.in_(ids), CallEvent.called_at >= launch)
            .order_by(CallEvent.called_at)
        )
    ).all():
        calls[lead_id].append((user_id, outcome, _aware(at)))
    return _Proofs(flp, batches, test_passed, ticks, claims, calls)


def proven_steps(lead: Lead, owner_id: int, p: _Proofs, launch: datetime, now: datetime) -> dict[str, datetime]:
    """Every step this lead has proof for right now → when it happened."""
    out: dict[str, datetime] = {}
    lid = lead.id
    tracking = lead.process_tracking or {}

    if lid in p.flp_views:
        out["video_watched"] = p.flp_views[lid]

    own_calls = [(o, at) for (u, o, at) in p.calls.get(lid, []) if u == owner_id]
    claim_at = min((at for (u, at) in p.claims.get(lid, []) if u == owner_id), default=None)
    if claim_at is not None and own_calls and own_calls[0][1] - claim_at <= FAST_CALL_WINDOW:
        out["fast_first_call"] = own_calls[0][1]
    for outcome, at in own_calls:
        if outcome in CONNECTED_OUTCOMES:
            out.setdefault(f"connected_call:{_ist_date(at).isoformat()}", at)

    mindset_at = _aware(lead.mindset_completed_at)
    if mindset_at and mindset_at >= launch and lead.mindset_completed_by_user_id not in (None, owner_id):
        out["mindset_complete"] = mindset_at

    used = p.batches.get(lid, {})

    proof_at = _aware(lead.enrollment_proof_uploaded_at)
    if (
        proof_at
        and proof_at >= launch
        and (lead.enrollment_proof_url or "").strip()
        and lead.status in ENROLLED_STATUSES
    ):
        leader_worked = [t for t in (out.get("mindset_complete"), *used.values()) if t]
        if leader_worked or now - proof_at >= ENROLL_CONFIRM_AFTER:
            out["enrolled"] = min(leader_worked, default=proof_at + ENROLL_CONFIRM_AFTER)
    for slot in BATCH_SLOTS:
        if slot in used and bool(getattr(lead, slot, False)):  # prospect watched AND still ticked
            out[slot] = used[slot]
    for day in ("d1", "d2"):
        slots = [f"{day}_{s}" for s in ("morning", "afternoon", "evening")]
        if all(s in out for s in slots):
            out[f"{day}_all"] = max(out[s] for s in slots)

    test_at = p.test_passed.get(lid)
    if test_at is None:
        return out  # everything after this needs the prospect's own passed test
    out["day2_test_passed"] = test_at

    day3 = tracking.get("day3") or {}
    for task, actor, at in p.ticks.get(lid, []):
        if actor == owner_id or not day3.get(task):
            continue  # self-ticked, or unticked since
        if task in DAY3_TICKS:
            out.setdefault(DAY3_TICKS[task], at)
        elif task == STAGE_TICK and lead.stage_selected:
            out.setdefault("stage_selected", at)

    closed_at = _aware(lead.day3_completed_at)
    if lead.status == "converted" and lead.stage_selected and closed_at and closed_at >= launch:
        out["converted"] = closed_at
    return out


# ── Scanner ─────────────────────────────────────────────────────────────────────


async def _early_points_today(session: AsyncSession, user_ids: list[int], now: datetime) -> dict[int, int]:
    start = datetime.combine(_ist_date(now), time.min, tzinfo=IST)
    rows = (
        await session.execute(
            select(ProcessPoint.user_id, ProcessPoint.step, ProcessPoint.points).where(
                ProcessPoint.user_id.in_(user_ids or [-1]),
                ProcessPoint.created_at >= start,
                ProcessPoint.revoked_at.is_(None),
            )
        )
    ).all()
    out: dict[int, int] = defaultdict(int)
    for uid, step, pts in rows:
        if base_step(step) in EARLY_STEPS:
            out[uid] += pts
    return out


async def scan(session: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    """Award new verified steps, revoke ones whose proof is gone. Commits."""
    now = _aware(now or datetime.now(timezone.utc))
    launch = await launched_at(session, now)
    since = max(launch, now - SCAN_LOOKBACK)
    ids = sorted(await _candidate_lead_ids(session, since, now))
    if not ids:
        await session.commit()
        return {"awarded": 0, "revoked": 0}

    leads = (await session.execute(select(Lead).where(Lead.id.in_(ids)))).scalars().all()
    owner_of = {lead.id: lead.owner_user_id or lead.assigned_to_user_id for lead in leads}
    users = {
        u.id: u
        for u in (
            await session.execute(select(User).where(User.id.in_([i for i in owner_of.values() if i] or [-1])))
        ).scalars().all()
    }
    proofs = await _load_proofs(session, ids, launch)
    existing: dict[int, dict[str, ProcessPoint]] = defaultdict(dict)
    for pt in (await session.execute(select(ProcessPoint).where(ProcessPoint.lead_id.in_(ids)))).scalars().all():
        existing[pt.lead_id][pt.step] = pt
    early = await _early_points_today(session, list(users), now)
    today = _ist_date(now)

    awarded = revoked = 0
    for lead in leads:
        have = existing.get(lead.id, {})
        owner = users.get(owner_of.get(lead.id))
        blocked = None
        if lead.deleted_at is not None:
            blocked = "lead_deleted"
        elif owner is None or owner.role not in EARNING_ROLES or owner.removed_at is not None:
            blocked = "not_eligible"
        elif _digits10(owner.phone) and _digits10(owner.phone) == _digits10(lead.phone):
            blocked = "own_number"
        if blocked:
            for pt in have.values():
                if pt.revoked_at is None:
                    pt.revoked_at, pt.revoked_reason = now, blocked
                    revoked += 1
            continue

        steps = proven_steps(lead, owner.id, proofs, launch, now)
        for step, pt in have.items():
            if pt.revoked_at is None and base_step(step) not in CALL_STEPS and step not in steps:
                pt.revoked_at, pt.revoked_reason = now, "proof_gone"
                revoked += 1
        for step, at in sorted(steps.items(), key=lambda kv: kv[1]):
            if step in have:
                pt = have[step]
                if pt.revoked_reason == "proof_gone":  # re-ticked after a correction
                    pt.revoked_at = pt.revoked_reason = None
                continue
            pts = POINTS[base_step(step)]
            if base_step(step) in EARLY_STEPS:
                if _ist_date(at) != today or early[owner.id] + pts > EARLY_DAILY_CAP:
                    continue
                early[owner.id] += pts
            point = ProcessPoint(user_id=owner.id, lead_id=lead.id, step=step, points=pts, created_at=now)
            try:
                async with session.begin_nested():
                    session.add(point)
            except IntegrityError:  # another scan got there first
                continue
            have[step] = point
            awarded += 1
    await session.commit()
    return {"awarded": awarded, "revoked": revoked}


# ── Tickets + jackpot ───────────────────────────────────────────────────────────


async def points_in_window(session: AsyncSession, start: datetime, end: datetime) -> dict[int, int]:
    rows = (
        await session.execute(
            select(ProcessPoint.user_id, func.sum(ProcessPoint.points))
            .where(ProcessPoint.created_at >= start, ProcessPoint.created_at < end, ProcessPoint.revoked_at.is_(None))
            .group_by(ProcessPoint.user_id)
        )
    ).all()
    return {int(uid): int(total or 0) for uid, total in rows}


async def pot_for(session: AsyncSession, draw_date: date) -> int:
    """₹150 + whatever rolled over from earlier days that had no winner."""
    prev = (
        await session.execute(
            select(JackpotDraw).where(JackpotDraw.draw_date < draw_date).order_by(JackpotDraw.draw_date.desc()).limit(1)
        )
    ).scalar_one_or_none()
    carry = prev.pot_cents if prev is not None and prev.winner_user_id is None else 0
    return DAILY_POT_CENTS + carry


async def eligible_tickets(session: AsyncSession, draw_date: date) -> dict[int, int]:
    start, end = draw_window(draw_date)
    pts = await points_in_window(session, start, end)
    if not pts:
        return {}
    ok = set(
        (
            await session.execute(
                select(User.id).where(User.id.in_(list(pts)), User.role.in_(EARNING_ROLES), User.removed_at.is_(None))
            )
        ).scalars().all()
    )
    return {uid: t for uid, p in pts.items() if uid in ok and (t := tickets_for(p)) > 0}


def pick_winner(tickets: dict[int, int], rand_below=secrets.randbelow) -> int | None:
    total = sum(tickets.values())
    if total <= 0:
        return None
    roll = rand_below(total)
    for uid in sorted(tickets):
        roll -= tickets[uid]
        if roll < 0:
            return uid
    return None  # unreachable


async def run_draw(session: AsyncSession, draw_date: date, rand_below=secrets.randbelow) -> JackpotDraw:
    """Draw ``draw_date`` once (idempotent) and credit the winner's wallet. Commits."""
    done = (await session.execute(select(JackpotDraw).where(JackpotDraw.draw_date == draw_date))).scalar_one_or_none()
    if done is not None:
        return done
    tickets = await eligible_tickets(session, draw_date)
    pot = await pot_for(session, draw_date)
    winner = pick_winner(tickets, rand_below)
    draw = JackpotDraw(
        draw_date=draw_date,
        pot_cents=pot,
        winner_user_id=winner,
        tickets_total=sum(tickets.values()),
        players=len(tickets),
    )
    session.add(draw)
    if winner is not None:
        session.add(
            WalletLedgerEntry(
                user_id=winner,
                amount_cents=pot,
                currency="INR",
                idempotency_key=f"jackpot:{draw_date.isoformat()}",
                note=f"MYLE Daily Jackpot {draw_date.isoformat()} — ₹{pot // 100}",
                created_by_user_id=None,
            )
        )
    await session.commit()
    return draw


# ── Pipeline meter ──────────────────────────────────────────────────────────────


async def pipeline_meter(session: AsyncSession, user_id: int, now: datetime) -> dict:
    now = _aware(now)
    leads = (
        await session.execute(
            select(Lead).where(
                (Lead.owner_user_id == user_id) | (Lead.assigned_to_user_id == user_id),
                Lead.status.in_(PIPELINE_STATUSES),
                Lead.deleted_at.is_(None),
                Lead.archived_at.is_(None),
                Lead.in_pool.is_(False),
            )
        )
    ).scalars().all()
    rows = []
    for lead in leads:
        last = _aware(lead.last_action_at or lead.created_at)
        income = JOINING_INCOME_RUPEES.get(lead.stage_selected or "", DEFAULT_JOINING_INCOME)
        rows.append(
            {
                "lead_id": lead.id,
                "name": lead.name,
                "status": lead.status,
                "potential_rupees": income,
                "at_risk": bool(last and now - last >= AT_RISK_AFTER),
            }
        )
    rows.sort(key=lambda r: (not r["at_risk"], -r["potential_rupees"]))
    return {
        "total_rupees": sum(r["potential_rupees"] for r in rows),
        "at_risk_rupees": sum(r["potential_rupees"] for r in rows if r["at_risk"]),
        "active": len(rows),
        "at_risk": sum(1 for r in rows if r["at_risk"]),
        "leads": rows[:30],
    }


# ── Read models ─────────────────────────────────────────────────────────────────


def _name(user: User | None) -> str:
    if user is None:
        return "—"
    raw = (user.name or user.username or user.fbo_id or "Member").strip()
    return raw.split(" ")[0] or "Member"


async def last_draw(session: AsyncSession) -> dict | None:
    draw = (
        await session.execute(select(JackpotDraw).order_by(JackpotDraw.draw_date.desc()).limit(1))
    ).scalar_one_or_none()
    if draw is None:
        return None
    winner = await session.get(User, draw.winner_user_id) if draw.winner_user_id else None
    return {
        "date": draw.draw_date.isoformat(),
        "pot_rupees": draw.pot_cents // 100,
        "winner_user_id": draw.winner_user_id,
        "winner_name": _name(winner) if winner else None,
        "players": draw.players,
        "tickets_total": draw.tickets_total,
        "rolled_over": draw.winner_user_id is None,
    }


async def my_rewards(session: AsyncSession, user: User, now: datetime | None = None) -> dict:
    now = _aware(now or datetime.now(timezone.utc))
    draw_date = current_draw_date(now)
    start, end = draw_window(draw_date)
    my_points = (await points_in_window(session, start, end)).get(user.id, 0)
    total = (
        await session.execute(
            select(func.coalesce(func.sum(ProcessPoint.points), 0)).where(
                ProcessPoint.user_id == user.id, ProcessPoint.revoked_at.is_(None)
            )
        )
    ).scalar_one()
    recent = (
        await session.execute(
            select(ProcessPoint, Lead.name)
            .join(Lead, Lead.id == ProcessPoint.lead_id)
            .where(ProcessPoint.user_id == user.id)
            .order_by(ProcessPoint.created_at.desc(), ProcessPoint.id.desc())
            .limit(15)
        )
    ).all()
    eligible = user.role in EARNING_ROLES and user.removed_at is None
    return {
        "eligible": eligible,
        "points_today": my_points,
        "points_total": int(total or 0),
        "tickets": tickets_for(my_points) if eligible else 0,
        "max_tickets": MAX_TICKETS_PER_DAY,
        "mp_per_ticket": MP_PER_TICKET,
        "next_ticket_in": (MP_PER_TICKET - my_points % MP_PER_TICKET)
        if tickets_for(my_points) < MAX_TICKETS_PER_DAY
        else 0,
        "pot_rupees": (await pot_for(session, draw_date)) // 100,
        "draw_at": end.isoformat(),
        "last_draw": await last_draw(session),
        "recent": [
            {
                "id": pt.id,
                "step": base_step(pt.step),
                "label": label_for(pt.step),
                "points": pt.points,
                "lead_name": lead_name,
                "at": _aware(pt.created_at).isoformat(),
                "revoked": pt.revoked_at is not None,
            }
            for pt, lead_name in recent
        ],
        "pipeline": await pipeline_meter(session, user.id, now),
        "table": [{"step": k, "label": LABELS[k], "points": v} for k, v in POINTS.items()],
    }


async def admin_points(session: AsyncSession, days: int = 7, now: datetime | None = None) -> list[dict]:
    now = _aware(now or datetime.now(timezone.utc))
    rows = (
        await session.execute(
            select(ProcessPoint, Lead.name, User)
            .join(Lead, Lead.id == ProcessPoint.lead_id)
            .join(User, User.id == ProcessPoint.user_id)
            .where(ProcessPoint.created_at >= now - timedelta(days=days))
            .order_by(ProcessPoint.created_at.desc(), ProcessPoint.id.desc())
            .limit(500)
        )
    ).all()
    return [
        {
            "id": pt.id,
            "user_id": u.id,
            "user_name": (u.name or u.username or u.fbo_id or "").strip(),
            "lead_id": pt.lead_id,
            "lead_name": lead_name,
            "step": base_step(pt.step),
            "label": label_for(pt.step),
            "points": pt.points,
            "at": _aware(pt.created_at).isoformat(),
            "revoked_at": _aware(pt.revoked_at).isoformat() if pt.revoked_at else None,
            "revoked_reason": pt.revoked_reason,
        }
        for pt, lead_name, u in rows
    ]


async def admin_draws(session: AsyncSession, limit: int = 30) -> list[dict]:
    draws = (
        await session.execute(select(JackpotDraw).order_by(JackpotDraw.draw_date.desc()).limit(limit))
    ).scalars().all()
    winners = {
        u.id: u
        for u in (
            await session.execute(
                select(User).where(User.id.in_([d.winner_user_id for d in draws if d.winner_user_id] or [-1]))
            )
        ).scalars().all()
    }
    return [
        {
            "date": d.draw_date.isoformat(),
            "pot_rupees": d.pot_cents // 100,
            "winner_user_id": d.winner_user_id,
            "winner_name": (winners[d.winner_user_id].name or "").strip() if d.winner_user_id in winners else None,
            "players": d.players,
            "tickets_total": d.tickets_total,
        }
        for d in draws
    ]
