# Phase 4 — Wallet + pool (high risk)

## Goal

**Atomic** wallet operations and pool claim: ledger append-only, **`idempotency_key` uniqueness**, debit + ownership transfer in one transaction; recharge approval idempotent per blueprint [`09_wallet.md`](../blueprint/09_wallet.md), [`07_lead_pool.md`](../blueprint/07_lead_pool.md). Evaluate **`SELECT … FOR UPDATE`** (or equivalent) on hot rows if double-claim / races are possible.

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/07_lead_pool.md`](../blueprint/07_lead_pool.md), [`09_wallet.md`](../blueprint/09_wallet.md)
- [`backend/app/api/v1/wallet.py`](../../backend/app/api/v1/wallet.py), [`lead_pool.py`](../../backend/app/api/v1/lead_pool.py)
- [`backend/app/api/v1/leads.py`](../../backend/app/api/v1/leads.py) — `POST …/claim` handler
- [`backend/app/services/wallet_ledger.py`](../../backend/app/services/wallet_ledger.py)
- [`backend/app/models/wallet_ledger.py`](../../backend/app/models/wallet_ledger.py), [`wallet_recharge.py`](../../backend/app/models/wallet_recharge.py) if present
- [`backend/app/schemas/wallet.py`](../../backend/app/schemas/wallet.py)
- Legacy: `wallet_ledger`, pool routes in [`backend/legacy/myle_dashboard_main3/`](../../backend/legacy/myle_dashboard_main3/)

## Paste prompt

**Phase 4 — Wallet + pool with strict transaction safety.**

**Only modify Allowed paths.** Claim path must: lock or safely order updates, check `in_pool`, check balance, insert ledger debit with idempotency, assign lead, commit once. Recharge approval: idempotent credit. On failure: rollback. No skipping idempotency or locks where spec requires.

## Allowed paths

- `backend/app/api/v1/wallet.py`
- `backend/app/api/v1/leads.py` (claim route and closely related helpers only)
- `backend/app/api/v1/lead_pool.py` (list/read; claim may live on leads — keep consistent)
- `backend/app/services/wallet_ledger.py`
- `backend/app/models/wallet_ledger.py`, wallet recharge / related models
- `backend/app/schemas/wallet.py`
- `backend/app/core/` — **only** if adding a named `transaction` / DB helper (e.g. `app/core/transaction.py` or `app/services/` module) — document in PR
- `backend/alembic/versions/*.py` if schema change required
- `backend/tests/**/test_wallet*.py`, `test_lead_pool*.py`, `test_*claim*.py`

## Forbidden

- Editing FSM core (`pipeline_rules.py`) except imports/constants needed for unrelated fixes — prefer separate PR.
- Removing ledger append-only invariant or adding a mutable `balance` column on `users`.
- Implementing daily reports or training in this PR.

## Verify

```bash
cd backend && pytest
```

Manual: insufficient balance → HTTP 402; duplicate claim / duplicate recharge approval → safe replay behavior.

## Lock

- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) for wallet/pool rows.
- Document any deliberate difference from legacy in the matrix.
