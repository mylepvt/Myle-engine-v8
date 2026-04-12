# 09 — Wallet (Recharge, Ledger, Admin Adjust)

> Source: `routes/wallet_routes.py` (team endpoints), `routes/lead_pool_routes.py` (admin approval + adjust), `services/wallet_ledger.py`, `helpers.py::_get_wallet`.

## 1. Core model — append-only ledger

There is **no balance column**. Balance is always computed fresh from two SUMs:

```python
def _get_wallet(db, username) -> dict:
    recharged = SUM(wallet_recharges.amount WHERE username=? AND status='approved')
    spent     = sum_pool_spent_for_buyer(db, username)
    balance   = max(recharged - spent, 0)
    return {'recharged': recharged, 'spent': spent, 'balance': balance}
```

`sum_pool_spent_for_buyer` (from `services/wallet_ledger.py`):
```sql
SELECT COALESCE(SUM(pool_price),0) FROM leads
WHERE in_pool=0
  AND TRIM(COALESCE(deleted_at,''))=''
  AND TRIM(COALESCE(claimed_at,''))!=''
  AND TRIM(COALESCE(current_owner,''))=:buyer
```

**Key property:** spend is keyed on `current_owner`, not `assigned_user_id`, so handoffs never double-charge (see file 07 for the full rationale).

## 2. Schema — `wallet_recharges`

```sql
CREATE TABLE wallet_recharges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    amount REAL NOT NULL,                  -- can be negative for admin debit
    utr_number TEXT UNIQUE,                -- real UTR OR 'ADMIN-ADJUST-<ts>-<hex>'
    status TEXT DEFAULT 'pending',         -- pending | approved | rejected
    admin_note TEXT DEFAULT '',
    requested_at TEXT DEFAULT (IST_NOW),
    processed_at TEXT
)
```

**Invariants:**
- `utr_number` is UNIQUE — prevents a user accidentally double-submitting the same real UTR and prevents duplicate admin-adjust writes.
- Admin adjustments land in the SAME table with `status='approved'` and `utr = 'ADMIN-ADJUST-<iso_ts>-<4 hex>'`. This means the ledger has one source of truth; reconciliation always reads one table.
- `amount` may be negative when admin debits (e.g., chargeback, reversal). The balance formula still clamps `max(..., 0)`.

## 3. `GET /wallet` — team view

Returns `wallet.html` with:
- `wallet = _get_wallet(db, me)` — live balance, recharged, spent
- `recharges = SELECT * FROM wallet_recharges WHERE username=me ORDER BY requested_at DESC LIMIT 20`
- `claimed_leads = recent_buyer_claimed_leads(db, me, limit=20)` — last 20 pool buys
- `upi_id = _get_setting('upi_id')`
- `upi_qr_b64 = _generate_upi_qr_base64(upi_id)` — on-the-fly base64 PNG for the payment screen
- `pending_mine = COUNT(*) WHERE username=me AND status='pending'` — banner hint

## 4. `POST /wallet/request-recharge`

Form: `amount`, `utr_number`.

### Validation
1. `amount > 0` (else flash + redirect)
2. `utr_number` non-empty
3. Idempotent UTR check:
   ```sql
   SELECT id FROM wallet_recharges WHERE utr_number=?
   ```
   If row exists → flash `"This UTR number has already been submitted..."` and redirect.

### Insert
```sql
INSERT INTO wallet_recharges (username, amount, utr_number, status)
VALUES (?, ?, ?, 'pending')
```
`requested_at` defaults to `IST_NOW`.

Success flash: `"Recharge request of ₹X submitted! UTR: Y. Admin will credit your wallet within 24 hours."`

## 5. `GET /admin/wallet-requests`

Admin list of recharges. Query param `status ∈ {pending, approved, rejected}` (default `pending`).

```sql
SELECT wr.*, u.phone AS user_phone
FROM wallet_recharges wr
LEFT JOIN users u ON wr.username = u.username
WHERE wr.status = :filter
ORDER BY wr.requested_at DESC
```

Also returns `pending_count` for the header badge.

## 6. `POST /admin/wallet-requests/<id>/approve`

```python
UPDATE wallet_recharges SET status='approved', processed_at=now_ist WHERE id=?
```

After commit:
- Flash success to admin.
- **Background thread** `_bg_push_recharge(username, amount)`:
  - Opens its own DB connection.
  - Calls `_push_to_users(username, "✅ Wallet Recharged!", "₹X has been added to your wallet.", "/wallet")`.
  - Never blocks the admin request.

Because balance is computed on the fly, approving instantly changes every downstream view. No cache invalidation needed.

## 7. `POST /admin/wallet-requests/<id>/reject`

Form: `admin_note`.

```sql
UPDATE wallet_recharges SET status='rejected', processed_at=now_ist, admin_note=? WHERE id=?
```

No push sent (admin convention: contact user out-of-band if note is sensitive). Flash `"Recharge request from @X rejected."`.

## 8. `POST /admin/members/<username>/wallet-adjust`

Admin-only manual adjustment. Form: `amount` (float, may be negative), `note` (default `"Manual adjustment by admin"`).

### Validation
- `amount != 0` (zero rejected)
- `amount` is numeric
- Target `username` exists in `users`

### Insert
```python
ts  = now_ist
utr = f"ADMIN-ADJUST-{ts.replace(' ', 'T').replace(':', '')}-{secrets.token_hex(4)}"

INSERT INTO wallet_recharges
    (username, amount, utr_number, status, requested_at, processed_at, admin_note)
VALUES
    (:username, :amount, :utr, 'approved', :ts, :ts, :note)
```

**Why unique synthetic UTR?** Ensures:
- Two identical adjustments never collide on the UNIQUE index.
- Reconciliation queries (file 07) count every row exactly once.
- Audit trail shows exactly when each adjustment happened.

Activity log: `wallet_admin_adjust` with `target=<user> amount=<float> note=<note>`.

### Post-action
- Compute `wallet_after = _get_wallet(db, username)` and flash the new `recharged / spent / balance` breakdown.
- **Background thread** `_bg_push_adjust(username, amount)`:
  - Positive amount → push "✅ Wallet adjusted", "₹X credited by admin."
  - Negative amount → push "⚠️ Wallet adjusted", "₹|X| debited by admin."
  - URL `/wallet`.

## 9. `_get_setting('upi_id')` & QR code

`_generate_upi_qr_base64(upi_id)`:
- If `upi_id` empty → returns None.
- Otherwise builds `upi://pay?pa=<upi_id>&pn=Myle&cu=INR` and renders a PNG via `qrcode`, then base64-encodes it for inline `<img>` use.

The QR is generated per request (cheap) — no on-disk file cache.

## 10. Reconciliation logging (warn-only)

Every successful pool claim (file 07) does a post-commit reconciliation:
```python
wallet_after = _get_wallet(db, username)
spent_sql    = sum_pool_spent_for_buyer(db, username)
if abs(wallet_after['spent'] - spent_sql) > 0.01:
    logger.warning("wallet_mismatch user=... wallet_spent=... sql_spent=...")
```
This should never fire (both come from the same SQL), but serves as a tripwire if a future refactor introduces a cache layer or a denormalized column.

## 11. Balance math edge cases

- **Negative computed balance** (e.g., admin debit exceeds recharges): clamped to `0` via `max(recharged - spent, 0)`. The original `recharged` and `spent` numbers are preserved and shown on the wallet page for clarity.
- **Pending recharge**: NOT counted. Only `status='approved'` rows contribute to `recharged`.
- **Rejected recharge**: NOT counted. Shown in history only.
- **Soft-deleted leads**: EXCLUDED from `spent` (`TRIM(deleted_at)=''`). If a bought lead is archived, the user's spend technically drops by that lead's `pool_price` — that's the intended behavior (an archive is effectively a refund).
- **Pool leads in a user's history**: EXCLUDED (`in_pool=0` required). A lead pushed back to pool stops counting against the previous buyer once `in_pool=1` is set — rare (admin tool only).

## Acceptance Checklist

- [ ] Wallet balance is never stored; always computed from `max(SUM(approved recharges) - SUM(pool spent), 0)`
- [ ] `wallet_recharges.utr_number` is UNIQUE; duplicate submissions are rejected with flash message
- [ ] Team `/wallet/request-recharge` requires `amount > 0` AND non-empty `utr_number`
- [ ] New recharge is inserted with `status='pending'`, `requested_at=now_ist`
- [ ] `/admin/wallet-requests` filters by `pending|approved|rejected`
- [ ] Approve sets `status='approved'` and `processed_at=now_ist`, then fires push in background thread
- [ ] Reject sets `status='rejected'` + `admin_note`, no push
- [ ] Admin adjust creates a `status='approved'` row with synthetic UTR `ADMIN-ADJUST-<iso>-<hex>`
- [ ] Admin adjust accepts negative amounts (debit) but rejects zero
- [ ] Admin adjust writes `activity_log.wallet_admin_adjust` with target/amount/note
- [ ] Spent SUM excludes `in_pool=1`, soft-deleted, and unclaimed rows
- [ ] Spent SUM keys on `current_owner` not `assigned_user_id` (handoffs don't follow the spend)
- [ ] `_generate_upi_qr_base64` returns None if `upi_id` setting is empty
- [ ] Balance is clamped to 0 (never negative) in the UI, but raw `recharged`/`spent` still shown
