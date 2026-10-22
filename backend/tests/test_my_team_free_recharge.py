"""Leader's My Team view and free recharge requests: own team only, admin decides."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.free_recharge_request import FreeRechargeRequest
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from app.services.ledger_sync import wallet_kind

FREE = "/api/v1/wallet/free-recharge-requests"
TEAM = "/api/v1/team/my-team"

LEADER, CHILD, GRANDCHILD, OUTSIDER = 202, 201, 97601, 97602


@pytest.fixture
async def seeded(engine, monkeypatch):
    async def _no_push(*_a, **_k):
        return None

    import app.api.v1.wallet as wallet_api

    monkeypatch.setattr(wallet_api, "send_push_to_user_bg", _no_push)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        for uid, role, name, upline in (
            (203, "admin", "Admin", None),
            (LEADER, "leader", "Pushpinder", None),
            (CHILD, "team", "Asha", LEADER),
            (GRANDCHILD, "team", "Ravi", CHILD),
            (OUTSIDER, "team", "Other Team", None),
        ):
            u = await s.get(User, uid)
            if u is None:
                u = User(id=uid, fbo_id=f"MT{uid}", email=f"mt{uid}@test.myle", role=role)
                s.add(u)
            u.role, u.name, u.upline_user_id = role, name, upline
        await s.flush()
        ids = [LEADER, CHILD, GRANDCHILD, OUTSIDER]
        await s.execute(delete(FreeRechargeRequest).where(FreeRechargeRequest.user_id.in_(ids)))
        await s.execute(delete(Lead).where(Lead.name.like("MT lead%")))
        await s.execute(delete(WalletLedgerEntry).where(WalletLedgerEntry.user_id.in_([GRANDCHILD, OUTSIDER])))
        # SQLite reuses ids of deleted requests; drop their old credit lines too.
        await s.execute(delete(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key.like("free_recharge_%")))
        await s.execute(delete(WalletRecharge).where(WalletRecharge.utr_number.like("MTUTR%")))
        s.add_all(
            [
                WalletRecharge(user_id=GRANDCHILD, amount_cents=150000, utr_number="MTUTR1", status="approved"),
                WalletRecharge(user_id=GRANDCHILD, amount_cents=50000, utr_number="MTUTR2", status="pending"),
                WalletLedgerEntry(user_id=GRANDCHILD, amount_cents=150000, idempotency_key="mt-r1", note="Recharge approved #1"),
                WalletLedgerEntry(user_id=GRANDCHILD, amount_cents=-9000, idempotency_key="pool_claim_1_97601", note="Lead pool claim — #1 A"),
                WalletLedgerEntry(user_id=OUTSIDER, amount_cents=777700, idempotency_key="mt-out", note="Recharge approved #2"),
                Lead(name="MT lead 1", status="new_lead", created_by_user_id=GRANDCHILD, owner_user_id=GRANDCHILD, assigned_to_user_id=GRANDCHILD),
                Lead(name="MT lead 2", status="day1", created_by_user_id=GRANDCHILD, owner_user_id=GRANDCHILD, assigned_to_user_id=CHILD),
                Lead(name="MT lead 3", status="contacted", created_by_user_id=OUTSIDER, owner_user_id=OUTSIDER),
            ]
        )
        await s.commit()
    return factory


class _As:
    """One client; ``as_.leader`` etc. switch who the next request is from."""

    def __init__(self, client, who):
        self._c, self._who = client, who

    def _set(self, role, uid):
        self._who["user"] = AuthUser(user_id=uid, role=role, email=f"{role}{uid}@test.myle")
        return self._c

    @property
    def leader(self):
        return self._set("leader", LEADER)

    @property
    def team(self):
        return self._set("team", CHILD)

    @property
    def admin(self):
        return self._set("admin", 203)


@pytest.fixture
async def as_(seeded):
    from main import app

    async def _get_db():
        async with seeded() as s:
            yield s

    who: dict = {}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield _As(client, who)
    app.dependency_overrides = saved


@pytest.mark.asyncio
async def test_leader_asks_only_for_own_team(as_, seeded):
    mine = await as_.leader.post(FREE, json={"user_id": LEADER, "amount_cents": 50000, "reason": "Own start"})
    assert mine.status_code == 201, mine.text
    deep = await as_.leader.post(FREE, json={"user_id": GRANDCHILD, "amount_cents": 20000, "reason": "New joiner"})
    assert deep.status_code == 201, deep.text
    assert deep.json()["status"] == "pending"
    assert deep.json()["member_name"] == "Ravi"
    assert deep.json()["requested_by_name"] == "Pushpinder"

    other = await as_.leader.post(FREE, json={"user_id": OUTSIDER, "amount_cents": 20000, "reason": "x y"})
    assert other.status_code == 403, other.text

    member = await as_.team.post(FREE, json={"user_id": CHILD, "amount_cents": 20000, "reason": "Me please"})
    assert member.status_code == 403, member.text

    listed = (await as_.leader.get(FREE)).json()["items"]
    assert {r["user_id"] for r in listed} >= {LEADER, GRANDCHILD}
    assert all(r["requested_by_user_id"] == LEADER or r["user_id"] == LEADER for r in listed)


@pytest.mark.asyncio
async def test_admin_approval_credits_promo_once(as_, seeded):
    req = (await as_.leader.post(FREE, json={"user_id": CHILD, "amount_cents": 30000, "reason": "Off-record deal"})).json()

    forbidden = await as_.leader.patch(f"{FREE}/{req['id']}", json={"status": "approved"})
    assert forbidden.status_code == 403

    ok = await as_.admin.patch(f"{FREE}/{req['id']}", json={"status": "approved"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "approved"
    again = await as_.admin.patch(f"{FREE}/{req['id']}", json={"status": "rejected"})
    assert again.json()["status"] == "approved"

    async with seeded() as s:
        lines = (
            await s.execute(select(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key == f"free_recharge_{req['id']}"))
        ).scalars().all()
    assert len(lines) == 1
    assert lines[0].user_id == CHILD and lines[0].amount_cents == 30000
    assert wallet_kind(lines[0].idempotency_key, lines[0].note) == "promo"


@pytest.mark.asyncio
async def test_rejection_credits_nothing(as_, seeded):
    req = (await as_.leader.post(FREE, json={"user_id": CHILD, "amount_cents": 40000, "reason": "Try"})).json()
    res = await as_.admin.patch(f"{FREE}/{req['id']}", json={"status": "rejected", "admin_note": "No"})
    assert res.json()["status"] == "rejected"
    async with seeded() as s:
        hit = (
            await s.execute(select(WalletLedgerEntry.id).where(WalletLedgerEntry.idempotency_key == f"free_recharge_{req['id']}"))
        ).first()
    assert hit is None


@pytest.mark.asyncio
async def test_my_team_overview_is_own_downline_only(as_, seeded):
    assert (await as_.team.get(TEAM)).status_code == 403

    data = (await as_.leader.get(TEAM)).json()
    assert data["me"]["user_id"] == LEADER
    by_id = {m["user_id"]: m for m in data["members"]}
    assert set(by_id) >= {CHILD, GRANDCHILD}
    assert OUTSIDER not in by_id

    ravi = by_id[GRANDCHILD]
    assert ravi["is_direct"] is False and ravi["upline_name"] == "Asha"
    assert ravi["wallet_cents"] == 141000
    assert ravi["recharged_cents"] == 150000
    assert ravi["pending_recharges"] == 1
    assert ravi["spent_on_leads_cents"] == 9000
    # Lead 2 was reassigned to Asha: it counts for whoever is working it now.
    assert ravi["status_counts"] == {"new_lead": 1}
    assert by_id[CHILD]["status_counts"].get("day1") == 1
    labels = {r["status"]: r["label"] for r in data["team_status_counts"]}
    assert labels["day1"] == "Day 1"


@pytest.mark.asyncio
async def test_member_detail_guarded(as_, seeded):
    out = await as_.leader.get(f"{TEAM}/{OUTSIDER}")
    assert out.status_code == 404

    d = (await as_.leader.get(f"{TEAM}/{GRANDCHILD}")).json()
    assert {r["utr_number"] for r in d["recharges"]} == {"MTUTR1", "MTUTR2"}
    kinds = {l["kind"] for l in d["wallet_lines"]}
    assert {"recharge", "claim"} <= kinds
    assert [l["name"] for l in d["leads"]] == ["MT lead 1"]
    assert (await as_.leader.get(f"{TEAM}/{LEADER}")).status_code == 200
