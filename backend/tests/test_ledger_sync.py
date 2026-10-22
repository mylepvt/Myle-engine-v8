"""Myle Bridge read side: the Ledger copies members, wallet lines, recharges and invoices."""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.models  # noqa: F401 — register all mappers
from app.core.config import settings
from app.models.invoice import Invoice
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from app.services import ledger_bridge, ledger_sync

SECRET = "c" * 40


@pytest.fixture(autouse=True)
def _bridge_on(monkeypatch):
    monkeypatch.setattr(settings, "myle_bridge_secret", SECRET)


def _signed(body: dict) -> tuple[bytes, dict[str, str]]:
    raw = json.dumps(body).encode()
    return raw, ledger_bridge.signed_headers(raw)


def test_wallet_kind_matches_each_writer():
    k = ledger_sync.wallet_kind
    assert k("recharge_12", "Recharge approved #12") == "recharge"
    assert k("pool_claim_5_7", "Lead pool claim — #5 Asha") == "claim"
    assert k("pool_claim_5_7_2", None) == "claim"
    assert k("lead_refund_3_5", "Refund — Lead #5 (MC-1): bad number") == "refund"
    assert k("league:2026-10-12:7", "MYLE Team League") == "reward"
    assert k("scratch:4", None) == "reward"
    assert k("jackpot:2026-10-20", None) == "reward"
    assert k("adm-abcdefgh", "Promo: Diwali") == "promo"
    assert k("adm-abcdefgh", "Fix typo") == "adjustment"
    assert k(None, None) == "adjustment"


def test_parse_request_clamps_and_refuses_unknown_tables():
    assert ledger_sync.parse_request({"table": "wallet"}) == ("wallet", 0, 500)
    assert ledger_sync.parse_request({"table": "members", "after_id": -4, "limit": 99999}) == ("members", 0, 1000)
    assert ledger_sync.parse_request({"table": "users"}) is None
    assert ledger_sync.parse_request({"table": "wallet", "after_id": "x"}) is None
    assert ledger_sync.parse_request([]) is None


async def _seed(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add_all(
            [
                User(id=97201, email="sync-lead@test.myle", role="leader", name="Neha", fbo_id="FS1", phone="919800000001"),
                User(id=97202, email="sync-team@test.myle", role="team", name="Ravi", fbo_id="FS2", upline_user_id=97201),
            ]
        )
        await s.flush()
        s.add(WalletRecharge(id=97301, user_id=97202, amount_cents=100000, utr_number="UTR9", status="approved"))
        await s.flush()
        s.add_all(
            [
                WalletLedgerEntry(id=97401, user_id=97202, amount_cents=100000, idempotency_key="recharge_9301", note="Recharge approved #97301"),
                WalletLedgerEntry(id=97402, user_id=97202, amount_cents=-4500, idempotency_key="pool_claim_1_9202", note="Lead pool claim — #1 A"),
                WalletLedgerEntry(id=97403, user_id=97202, amount_cents=20000, idempotency_key="sync-promo-1", note="Promo: Diwali"),
            ]
        )
        await s.flush()
        s.add(
            Invoice(
                id=97501, invoice_number="SYNC-R-1", doc_type="payment_receipt", user_id=97202, total_cents=100000,
                payload_json={"payment_reference": "UTR9"}, wallet_recharge_id=97301, wallet_ledger_entry_id=97401,
            )
        )
        await s.commit()


async def test_ledger_sync_pages_each_table(anon_client, engine):
    await _seed(engine)

    raw, headers = _signed({"table": "members", "after_id": 97200, "limit": 1})
    r = await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)
    assert r.status_code == 200
    page = r.json()
    assert page["done"] is False and page["next_after_id"] == 97201
    assert {k: page["rows"][0][k] for k in ("name", "role", "leader_id", "status")} == {
        "name": "Neha", "role": "leader", "leader_id": 97201, "status": "active",
    }

    raw, headers = _signed({"table": "members", "after_id": 97201, "limit": 1})
    ravi = (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)).json()["rows"][0]
    assert ravi["id"] == 97202 and ravi["leader_id"] == 97201 and ravi["upline_id"] == 97201

    raw, headers = _signed({"table": "wallet", "after_id": 97400})
    wallet = (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)).json()
    mine = [w for w in wallet["rows"] if w["member_id"] == 97202]
    assert [(w["kind"], w["amount_paise"]) for w in mine] == [("recharge", 100000), ("claim", -4500), ("promo", 20000)]
    assert wallet["done"] is True

    raw, headers = _signed({"table": "recharges", "after_id": 97300})
    rech = (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)).json()["rows"]
    assert [(x["utr"], x["status"], x["amount_paise"]) for x in rech if x["id"] == 97301] == [("UTR9", "approved", 100000)]

    raw, headers = _signed({"table": "invoices", "after_id": 97500})
    inv = (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)).json()["rows"]
    assert [(x["number"], x["doc_type"], x["recharge_id"], x["payload"]) for x in inv if x["id"] == 97501] == [
        ("SYNC-R-1", "payment_receipt", 97301, {"payment_reference": "UTR9"})
    ]


async def test_ledger_sync_refuses_unsigned_or_unknown(anon_client):
    raw, headers = _signed({"table": "wallet"})
    assert (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw)).status_code == 401
    assert (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw + b" ", headers=headers)).status_code == 401
    raw, headers = _signed({"table": "users"})
    assert (await anon_client.post("/api/v1/bridge/ledger-sync", content=raw, headers=headers)).status_code == 400


async def test_admin_promo_credit_lands_in_the_members_wallet(admin_client, engine, monkeypatch):
    # Even with the crm-api microservice configured, the adjustment is written here, to the member.
    monkeypatch.setattr(settings, "crm_api_url", "http://crm-api.invalid")
    monkeypatch.setattr(settings, "crm_internal_secret", "x" * 32)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(User(id=97601, email="sync-promo@test.myle", role="team", name="Promo", fbo_id="FS6"))
        await s.commit()
    r = await admin_client.post(
        "/api/v1/wallet/adjustments",
        json={"user_id": 97601, "amount_cents": 20000, "idempotency_key": "sync-promo-97601", "note": "Diwali", "kind": "promo"},
    )
    assert r.status_code == 201, r.text
    async with factory() as s:
        rows = (
            await s.execute(select(WalletLedgerEntry).where(WalletLedgerEntry.user_id == 97601))
        ).scalars().all()
    assert [(e.amount_cents, e.note) for e in rows] == [(20000, "Promo: Diwali")]
    assert ledger_sync.wallet_kind(rows[0].idempotency_key, rows[0].note) == "promo"
