# 07 — Lead Pool (Claim + Wallet Atomicity)

> Source: `routes/wallet_routes.py` (team pool + claim), `routes/lead_pool_routes.py` (admin pool), `services/wallet_ledger.py`.

## 1. Concept

The **Lead Pool** is a shared queue of leads with `in_pool=1 AND assigned_user_id IS NULL`. Any approved team/leader can "claim" one or more leads from it; the claim price is debited from their wallet, the lead becomes theirs (`in_pool=0`, `assigned_user_id=me.id`, `current_owner=me.username`, `claimed_at=now_ist`).

**Lead ownership invariant** is preserved in a single atomic `UPDATE … WHERE in_pool=1 AND assigned_user_id IS NULL` — if two users race, only one wins.

## 2. Wallet = append-only ledger (conceptually)

There is NO balance column. Balance is computed on demand:

```python
recharged = SUM(wallet_recharges.amount WHERE username=? AND status='approved')
spent     = SUM(leads.pool_price WHERE current_owner=? AND in_pool=0
                AND TRIM(claimed_at) != '' AND deleted_at='')
balance   = max(recharged - spent, 0)
```

**Critical:** `spent` keys on `current_owner` (the buyer at claim time), NOT `assigned_user_id`. When a lead is later handed off to a leader or team member, `assigned_user_id` moves but `current_owner` stays with the buyer — so the wallet spend never follows handoffs.

## 3. `GET /lead-pool` — team/leader view

Renders `lead_pool.html`. Query:
- `wallet_stats = _get_wallet(db, username)`
- `pool_count = COUNT(*) FROM leads WHERE in_pool=1`
- `price_info = MIN/MAX/AVG(pool_price) FROM leads WHERE in_pool=1`
- `can_claim = min(balance // avg_price, pool_count)` (0 if pool empty)
- `my_claims = count_buyer_claimed_leads(db, username)` — lifetime
- `claim_gate_message` — see gates below
- `perf_state` — performance UI state (discipline status/grace banner)

## 4. Claim Gates — `_team_claim_gate_message()` for team

If team has 0 active leads → no gate, always allow.

Otherwise check in order:

### Gate 1 — Payment proof missing
```sql
SELECT COUNT(*) FROM leads
WHERE assigned_user_id=:me AND in_pool=0 AND deleted_at=''
  AND (claimed_at >= now - 10 days OR (claimed_at IS NULL AND created_at >= now - 10 days))
  AND status = 'Paid ₹196'
  AND TRIM(COALESCE(payment_proof_path,'')) = ''
```
If > 0 → block: `"Claim blocked: ₹196 leads without screenshot proof found."`

### Gate 2 — Stale "Video Watched" leads
```sql
SELECT COUNT(*) FROM leads
WHERE assigned_user_id=:me AND in_pool=0 AND deleted_at=''
  AND (claimed_at >= now - 10 days OR created_at >= now - 10 days)
  AND status = 'Video Watched'
  AND updated_at <= now - 24 hours
```
If > 0 → block: `"Claim blocked: Video Watched leads are pending action for 24h+."`

### Leader gates — `claim_hard_gate_message(db, username)`
Leader has a stricter set (circular inactivity + performance discipline + downline health). See `helpers.py::claim_hard_gate_message`. If returned non-None, block.

## 5. `POST /lead-pool/claim` — atomic claim

Form: `count` (1..50, default 1).

### Sequence

```python
maybe_auto_seed_claim_discipline_start(db)   # idempotent first-time init

db.execute("BEGIN IMMEDIATE")

wallet_stats = _get_wallet(db, username)
now = now_ist

# Role gate
if role == 'team':
    gate_msg = _team_claim_gate_message(db, username, user_id)
    if gate_msg: ROLLBACK + flash + redirect /lead-pool

    # Daily claim cap
    max_claim_day = int(setting 'team_max_claim_per_day', default 999)
    if count_buyer_claims_on_local_date(db, username, now) >= max_claim_day:
        ROLLBACK + block

    # Cooldown
    cooldown_min = int(setting 'team_claim_cooldown_minutes', default 0)
    if cooldown_min > 0:
        last = SELECT MAX(created_at) FROM activity_log
                WHERE username=? AND event_type='lead_claim'
        if (now - last) < cooldown_min: ROLLBACK + block

elif role == 'leader':
    gate_msg = claim_hard_gate_message(db, username)
    if gate_msg: ROLLBACK + block
```

### Pick rows
```sql
SELECT id, pool_price, status, pipeline_stage
FROM leads
WHERE in_pool=1 AND assigned_user_id IS NULL
ORDER BY created_at ASC, id ASC
LIMIT :count
```
Tie-breaker on `id` ensures stable FIFO even when many rows share `created_at` second.

If empty → ROLLBACK with `"No leads available"`.

### Wallet check
```python
total_cost = SUM(row.pool_price for row in available)
if total_cost > balance:
    ROLLBACK
    flash("Insufficient balance! Need ₹X but you have ₹Y. Please recharge.")
    return
```

### Per-row atomic UPDATE
```python
for row in available:
    eff_status = row.status or 'New Lead'
    eff_stage  = STATUS_TO_STAGE[eff_status] or 'prospecting'
    eff_pipe_entered = now if eff_status in PIPELINE_AUTO_EXPIRE_STATUSES else ''

    res = UPDATE leads SET
        assigned_user_id = :me_id,
        assigned_to      = '',
        in_pool          = 0,
        claimed_at       = :now,
        current_owner    = :me_username,   -- STICKY buyer marker
        pipeline_stage   = :eff_stage,
        status           = :eff_status,
        pipeline_entered_at = :eff_pipe_entered,
        updated_at       = :now
    WHERE id = :row.id AND in_pool = 1 AND assigned_user_id IS NULL

    if res.rowcount > 0:
        INSERT INTO lead_assignments
            (lead_id, assigned_to, previous_assigned_to, assigned_by,
             assign_type, reason, created_at)
        VALUES (:row.id, :me_id, NULL, :me_un, 'pool_claim', 'lead pool purchase', :now)
        assert_lead_owner_invariant(db, lead_id=row.id, context='claim_leads_success')
        _log_activity(db, me, 'lead_claim_row', f"...success=1")
        claimed_rows += 1
    else:
        # somebody else won the race on this row — log success=0 and skip
        _log_activity(db, me, 'lead_claim_row', f"...success=0")
```

### Finalize
```python
if claimed_rows == 0:
    ROLLBACK
    flash("No leads were claimed (already taken)")
    return

UPDATE users SET idle_hidden=0 WHERE username = :me
COMMIT
_log_activity(db, me, 'lead_claim', f"Claimed {claimed_rows} leads")

# Reconciliation log (warn-only)
wallet_after = _get_wallet(db, me)
spent_sql    = sum_pool_spent_for_buyer(db, me)
if abs(wallet_after['spent'] - spent_sql) > 0.01:
    logger.warning("wallet_mismatch")

flash(f"Successfully claimed {claimed_rows} leads for ₹{total_cost}!")
redirect /leads
```

### Error path
Any exception → ROLLBACK, emit `REL-CLM` incident code, log to `activity_log`, stderr traceback, user-facing `"Something went wrong while claiming leads"`.

## 6. Why `current_owner` is the wallet key

The ledger SQL in `services/wallet_ledger.py`:
```sql
WHERE in_pool = 0
  AND TRIM(COALESCE(deleted_at,'')) = ''
  AND TRIM(COALESCE(claimed_at,''))  != ''
  AND TRIM(COALESCE(current_owner,'')) = :buyer
```

When a team member pays ₹50 for a pool lead, then passes it to their leader (handoff via Paid ₹196), the leader becomes `assigned_user_id`, but `current_owner` stays = team member. The ₹50 spend remains attributed to the team member's wallet for eternity. This is how Myle avoids double-counting when leads move through the hierarchy.

## 7. Admin Pool

### `GET /admin/lead-pool`
Counts, paginated list (50/page), default price setting. Supports bulk imports.

### `POST /admin/lead-pool/import-csv`
- 5 MB file size limit
- UTF-8 with BOM handling (`utf-8-sig`)
- Supports many column name variants: `First Name/Last Name`, `Full Name`, `phone_number`/`Phone Number (Calling Number)`, `email/Email`, `Age/Gender/City/Ad Name/Submit Time`
- Skips row if both name+phone empty; uses `phone = 'N/A'` if only name exists
- Dedupe: check against `SELECT phone FROM leads WHERE deleted_at=''`
- `source = ad_name or :source_tag`
- Notes = `"Age: X | Gender: Y | Submit Time: Z"`
- INSERT with `in_pool=1, pool_price=:price, claimed_at=NULL, status='New'`
- On success, background thread: `_push_all_approved_users()` → "N new leads available. Claim your leads now!" with link `/lead-pool`

### `POST /admin/lead-pool/import-pdf`
Same flow, uses `_extract_leads_from_pdf(file)` which returns `[{name, phone, email, city}, ...]`.

### `POST /admin/lead-pool/add-single`
Manual single-row form. Same pattern.

### `POST /admin/lead-pool/<id>/remove`
Hard delete: `DELETE FROM leads WHERE id=? AND in_pool=1`. Only when pool row. No soft delete for pool rows.

### `GET /admin/lead-pool/duplicate-cleanup`
Shows pool rows whose phone matches an active (non-pool, non-deleted) lead — same person on two tables.

### `POST /admin/lead-pool/duplicate-cleanup/delete`
Bulk `DELETE FROM leads WHERE id IN (…) AND in_pool=1`.

## 8. Race-safety summary

- `BEGIN IMMEDIATE` at the start acquires the DB write lock (SQLite) so gates + picks + updates are isolated.
- Each `UPDATE` includes `AND in_pool=1 AND assigned_user_id IS NULL` so it's a no-op if another tx already claimed that row.
- `claimed_rows` counts only successful updates; if 0, the whole claim rolls back cleanly.
- `assert_lead_owner_invariant(lead_id, context)` sanity-checks after every successful update.
- Wallet reconciliation logs (warn-only) compare two SUM sources after the claim.

## 9. Activity + audit trail

Every claim writes three kinds of rows:
1. `activity_log` `'lead_claim_row'` (per-lead success/fail)
2. `activity_log` `'lead_claim'` (summary)
3. `lead_assignments` `'pool_claim'` (ownership provenance)

## Acceptance Checklist

- [ ] Wallet balance NEVER stored as a column — always computed from `recharged - spent`
- [ ] `spent` SUMs `pool_price` where `current_owner = :buyer`, NOT `assigned_user_id`
- [ ] `balance = max(recharged - spent, 0)` (never negative)
- [ ] Claim runs inside `BEGIN IMMEDIATE … COMMIT`
- [ ] Each per-row UPDATE contains `AND in_pool=1 AND assigned_user_id IS NULL`
- [ ] Stable FIFO order: `ORDER BY created_at ASC, id ASC`
- [ ] Team payment-proof gate blocks claim if any `status='Paid ₹196'` in last 10 days lacks `payment_proof_path`
- [ ] Team stale gate blocks claim if any `status='Video Watched'` hasn't been touched in 24h
- [ ] Leader claim uses `claim_hard_gate_message`
- [ ] Daily claim cap per team member respects `team_max_claim_per_day` setting
- [ ] Cooldown respects `team_claim_cooldown_minutes`
- [ ] On insufficient balance, ROLLBACK before any row is modified
- [ ] Every successful claim writes `lead_assignments` with `assign_type='pool_claim'`
- [ ] `current_owner` is set to buyer username at claim time and never overwritten by handoff
- [ ] `pipeline_stage` + `status` are normalized via `STATUS_TO_STAGE` on claim
- [ ] Admin CSV import skips duplicate phone across entire lead table
- [ ] Admin PDF import uses same dedupe
- [ ] Pool push-notification is best-effort in a background thread (never blocks the request)
- [ ] Race test: N users claiming simultaneously → total rows = pool size, no double-claim
- [ ] Wallet reconciliation mismatch is logged as warning (not fatal)
