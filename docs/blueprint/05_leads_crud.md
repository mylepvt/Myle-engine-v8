# 05 — Leads CRUD

> Source: `routes/lead_routes.py`.
> Uses constants from file 04 and schema from file 02.

## 1. Visibility Matrix

All listing queries start from the invariant:
```sql
FROM leads WHERE in_pool=0 AND deleted_at=''
```

| Role | Extra WHERE clause |
|---|---|
| admin | — (sees everything) |
| leader | `(assigned_user_id=:me_id OR stale_worker=:me_un OR current_owner=:me_un)` — execution + their bought pool rows |
| team | `(assigned_user_id=:me_id OR stale_worker=:me_un)` |

`current_owner` never "follows" assignee on handoff — only `assigned_user_id` moves. That's why leader still sees the row even after they push it down to a team member.

## 2. `GET /leads` — My Leads list

Query params:
- `status` — optional status filter
- `q` — search (name/phone/email/assignee for admin)
- `page` — pagination (history tab only)

Before the query runs, trigger auto-expire pass on scope:
- admin → `_expire_all_pipeline_leads(db)`
- leader → `_auto_expire_pipeline_leads_batch(db, [me] + downline)`
- team → `_auto_expire_pipeline_leads(db, me)`

The main result set is split into **Today** and **History**:
- Today = `claimed_at >= today_00:00 AND claimed_at < tomorrow_00:00`
- History = NOT Today

Then partitioned into tabs by status:
- `enrolled_leads` = status `Paid ₹196`
- `converted_leads` = status `Converted`
- `day1_leads` = status `Day 1`
- `day2_leads` = status `Day 2`
- `day3_leads` = status `Interview`
- `active_leads` = everything else (excluding Day1/Day2/Interview + enrolled + converted)

Excludes status `Lost` entirely (lives in `/old-leads` archive).

Each bucket has a matching `hist_*` counterpart for the History tab.

Team-role extra filter: hide leader-bought rows where `current_owner != me` AND `assigned_user_id != me.id` AND `stale_worker != me`.

Pagination: Today = 60 rows, History = 80 rows per page (`has_more_hist = len > 80`).

Rows are enriched via `_enrich_leads()` which adds:
- `heat_score`
- `next_action` (computed from status + elapsed time)
- `priority` (P1/P2/P3)
- `ai_tip` (short 1-line nudge)

## 3. `POST /leads/add`

Form fields: `name, phone, email, referred_by, source, status, payment_done, revenue, follow_up_date, call_result, notes, city`, plus admin-only `assigned_to` (username).

### Validation order

1. `name`, `phone` required.
2. **Duplicate phone check:** `SELECT … FROM leads WHERE phone=? AND deleted_at=''`. If duplicate exists in Lead Pool or Leads → 409.
3. If `status not in STATUSES` → force to `'New'`.
4. If `payment_done=1`, force `payment_amount = PAYMENT_AMOUNT (196)`.
5. `call_result` passed through `call_result_allowed()` filter.
6. Team role: `follow_up_date` is force-cleared (team can't self-schedule).
7. `validate_lead_business_rules(status, payment_done, payment_amount, 0, 0)` must pass.

### Ownership
- Admin: may pass `assigned_to=<username>`; resolves to `user_id`. If empty → assign to self.
- Team/Leader: `assigned_user_id = session.user_id`.

### Insert
```sql
INSERT INTO leads (name, phone, email, referred_by, assigned_to, assigned_user_id,
                   source, status, payment_done, payment_amount, revenue,
                   follow_up_date, call_result, notes, city,
                   in_pool, pool_price, claimed_at, pipeline_stage, current_owner)
VALUES (..., '', ?, ..., 0, 0, NULL, ?, ?)
```

`pipeline_stage = STATUS_TO_STAGE[status]`, `current_owner = session.username`.

Response: HTML redirect or `{ok:true, id, name, phone, city, status, source}` for AJAX.

## 4. `GET /leads/<id>/edit` — Edit form

Returns `edit_lead.html` with full lead row pre-populated. Admin/leader see all fields; team sees read-only `follow_up_date` (leader/admin only can set it) and the fields in `TEAM_ALLOWED_STATUSES` dropdown.

## 5. `POST /leads/<id>/edit`

Rebuilds the row from form fields, then:
1. `actor_may_use_assignee_execution_routes()` — permission gate
2. `validate_lead_business_rules()` — hard check
3. Applies update, updates `pipeline_stage` from `STATUS_TO_STAGE`, sets `updated_at = now_ist`.
4. If status changed to `Lost`/`Retarget`, clears `follow_up_date`, `follow_up_time`.
5. If status changed to `Paid ₹196`, stamps `enrolled_at` + `enrolled_by` (one-shot via `WHERE TRIM(COALESCE(enrolled_at,''))=''`).
6. Logs to `lead_notes` + `activity_log` + `lead_stage_history`.

## 6. `POST /leads/<id>/status` — Status change (primary FSM endpoint)

Form: `status`, optional `source_bucket=history` (to bump `claimed_at` to now).

Pipeline of gates (any failure = block + incident code + activity_log entry):

1. `new_status in STATUSES` (else `REL-STS` 400)
2. Lead exists and `in_pool=0 AND deleted_at=''`
3. `actor_may_use_assignee_execution_routes()` for team/leader
4. **Team gate:** `new_status not in TEAM_FORBIDDEN_STATUSES`
5. **Paid ₹196 execution gate** (team/leader):
   `rupees_196_execution_blocked_for_role()` — enforces proof uploaded + approved before status can flip
6. `_role_owns_status(role, new_status)` — secondary role check
7. **Leader → Day 1 rule:** lead must already be in `enrolled` stage (`Paid ₹196`) before being advanced to Day 1
8. **Strict flow guard** (if enabled): `is_valid_forward_status_transition(...)` — see file 04
9. **Duplicate guards** by phone:
   - same phone, different id, status ∈ {`Day 1`,`Day 2`,`Interview`} → 409
   - same phone, different id, status = `Paid ₹196` → 409
10. **Business rule:**
    - `Seat Hold Confirmed` requires `seat_hold_amount > 0`
    - `Fully Converted` requires `track_price > 0`

### On success

```
stage_changed = STATUS_TO_STAGE[new_status] != lead.pipeline_stage
now_str = IST now
```

If stage changed:
- `_transition_stage(db, lead_id, new_stage, actor, status_override=new_status)` — writes `lead_stage_history` row and updates `leads.pipeline_stage`, `leads.current_owner`, `leads.status`, `leads.pipeline_entered_at`
- Re-fetch lead, apply `payment_fields_after_status_change` (auto-set `payment_done=1, payment_amount=196` on entering Paid ₹196; clears on backtrack)
- Re-validate business rules
- If `new_status == 'Day 1'` and lead was fresh (no prior Paid ₹196 and `_is_fresh_lead()` true): award CONVERSION points (idempotent via `point_history` unique index)

If stage NOT changed:
- `pipeline_entered_at = now_str` only when `new_status in PIPELINE_AUTO_EXPIRE_STATUSES`
- Single UPDATE applies: `status, pipeline_stage, pipeline_entered_at, payment_done, payment_amount, updated_at`

### Post-status follow-ups

- `new_status in ('Lost','Retarget')` → clear `follow_up_date`, `follow_up_time`
- Log to `lead_notes` + `activity_log`
- **Team → Paid ₹196 → auto-handoff:** `_team_handoff_to_leader()` advances to `Day 1`, reassigns `assigned_user_id` + `current_owner` to upline leader, stamps `enrolled_at`.
- **Leader → Paid ₹196 → optional auto-Day1:** if `_leader_day1_routing_on(leader)` flag true, auto-advance to `Day 1` and keep `assigned_user_id` = leader.
- Stamp `enrolled_at/enrolled_by` on any role's Paid ₹196 (one-shot).
- If `source_bucket=history`, bump `claimed_at = updated_at = now` so the card jumps back to Today.
- `_check_and_award_badges()` for the assignee (see file 14).

AJAX response:
```json
{
  "ok": true,
  "status": "Day 1",
  "stage_changed": true,
  "new_stage": "day1",
  "new_badges": ["First Paid ₹196", ...]
}
```

## 7. `POST /leads/<id>/call-status`

Sets `call_status` + runs the **call discipline engine** (file 19). Form field `call_status` must be in `CALL_STATUS_VALUES` (or `TEAM_CALL_STATUS_VALUES` for team).

Buckets trigger side effects:
- NOT_INTERESTED → auto-status `Lost`
- NO_RESPONSE → increment `no_response_attempt_count`, on 3rd → `Retarget`
- INTERESTED → set `follow_up_date = tomorrow`, `follow_up_time = '10:00'`, reset `no_response_attempt_count`

Also increments `contact_count`, sets `last_contacted = now_ist`.

## 8. `POST /leads/<id>/mark-called`

Simpler endpoint used by the Working view "📞 Called" button — just bumps `call_status` to `Called - No Answer` and runs discipline.

## 9. `POST /leads/<id>/call-result`

Sets `call_result` (sub-tag within a call outcome). Whitelist via `CALL_RESULT_TAGS`.

## 10. `POST /leads/<id>/follow-up-time`

Body: `follow_up_date, follow_up_time`. Leader/admin only, OR team members scheduling self (role gate). Updates both fields and `updated_at`.

## 11. `POST /leads/<id>/quick-advance`

Shortcut button for the Working view: advances status to the next step in `STATUS_FLOW_ORDER`. Still runs ALL the gates from `update_status`. Used for the "→ Next" button.

## 12. `POST /leads/<id>/batch-toggle`

Toggles a Day1/Day2 batch checkbox (`d1_morning`, `d1_afternoon`, …, `d2_evening`). See file 06 for full batch rules.

## 13. `POST /leads/<id>/stage-advance`

Force-advance pipeline_stage directly (admin/leader tool). Uses `_transition_stage()`.

## 14. `POST /leads/<id>/ready-for-day1`

Leader-only endpoint: flips a `Paid ₹196` lead to `Day 1` and assigns it to leader. Team cannot call this (team's handoff is via `update_status → Paid ₹196`).

## 15. `POST /leads/<id>/delete` — Soft delete

```sql
UPDATE leads SET deleted_at = :now_ist WHERE id = ?
```
Then `assert_lead_owner_invariant(db, context='delete_lead_archive_guard')`.

Admin scope: any lead. Team/leader scope: must own (`assigned_user_id = me.id`).

Admin guard: refuses to archive if `assigned_user_id IS NULL OR 0` (prevents orphan-recovery problem). Returns `409 "Owner missing. Lead flagged to admin; archive blocked."` and logs CRITICAL.

## 16. `GET /leads/recycle-bin`

Lists `deleted_at != ''` leads. Team/leader: only own; admin: all.

## 17. `POST /leads/<id>/restore`

```sql
UPDATE leads SET deleted_at='' WHERE id=? [AND assigned_user_id=?]
```

## 18. `POST /leads/<id>/permanent-delete` — HARD delete (admin only)

```sql
DELETE FROM lead_notes WHERE lead_id=?
DELETE FROM leads      WHERE id=?
```

Only from recycle bin (lead must already have `deleted_at != ''`). `@admin_required`.

## 19. `POST /leads/<id>/notes`

```sql
INSERT INTO lead_notes (lead_id, username, note, created_at) VALUES (?, ?, ?, IST_NOW)
```
All roles may add notes on leads they can see.

## 20. `POST /leads/<id>/notes/<note_id>/delete`

Author or admin only.

## 21. `GET /leads/<id>/timeline`

Returns merged timeline JSON: `lead_notes` + `lead_stage_history` + `activity_log` entries for this lead, sorted by `created_at DESC`.

## 22. `GET /leads/export`

CSV download. Columns hard-coded:
```
id,name,phone,email,city,referred_by,assigned_user_id,source,status,
payment_done,payment_amount,revenue,day1_done,day2_done,interview_done,
follow_up_date,notes,created_at,updated_at
```
Scope by role (admin = all, else own).

## 23. `POST /leads/import`

Multipart CSV upload. Same column set. Row-by-row:
- Skip if phone already exists in any non-deleted row
- Insert with `assigned_user_id = session.user_id`, `status='New Lead'`, `pipeline_stage='prospecting'`, `in_pool=0`
- Runs same validation as `/leads/add`

Returns summary `{inserted, skipped_duplicates, errors}`.

## 24. `POST /leads/bulk-action`

Body: `ids[]=&action=...`. Actions:
- `delete` — soft delete many
- `change_status` — requires `status` param; runs single-lead pipeline per row
- `reassign` — admin only; `assigned_to=<username>`
- `to_pool` — admin/leader only; moves to pool with default price

## 25. `POST /leads/bulk-update`

Admin-only inline edit — `ids[]=&field=...&value=...`. Whitelisted fields: `source, city, follow_up_date, notes, status`.

## 26. `POST /leads/<id>/batch-share-url`

Generates a `batch_share_links` row with unique token for a given slot (e.g., `d1_morning`). Returns the full share URL `https://<host>/b/<token>`. See file 06 for how this is used on the Working board.

## 27. Timeline & audit

Every write in this file emits:
- `lead_notes` — user-visible timeline
- `activity_log` — admin audit
- `lead_stage_history` — on stage transitions
- `lead_assignments` — on ownership changes
- `point_history` — on CONVERSION awards (guarded by unique indexes)

## Acceptance Checklist

- [ ] `/leads/add` rejects duplicate phone with 409 and message naming the existing lead
- [ ] Team cannot set `follow_up_date` directly on add
- [ ] `payment_done=1` auto-forces `payment_amount=196`
- [ ] Every mutation updates `updated_at = now_ist`
- [ ] Every `status` change recomputes `pipeline_stage` in the same UPDATE
- [ ] Team `update_status` rejects `TEAM_FORBIDDEN_STATUSES` with 403
- [ ] Leader cannot push to Day 1 unless lead is already in `Paid ₹196`
- [ ] Team Paid ₹196 auto-handoff moves `assigned_user_id` + `current_owner` to leader and advances to Day 1
- [ ] Backward / off-flow transitions are allowed (admin correction escape hatch)
- [ ] Duplicate phone at Day1/Day2/Interview/Paid ₹196 is 409-blocked
- [ ] `Seat Hold Confirmed` rejected when `seat_hold_amount = 0`; `Fully Converted` rejected when `track_price = 0`
- [ ] Soft delete sets `deleted_at=now_ist`; admin archive blocked when `assigned_user_id` is empty
- [ ] Recycle bin shows own rows (team/leader) or all (admin)
- [ ] Permanent delete is admin-only and requires the row to already be soft-deleted
- [ ] `NOT_INTERESTED` bucket auto-moves to `Lost`; `NO_RESPONSE` 3 strikes → `Retarget`; `INTERESTED` sets follow-up tomorrow 10:00
- [ ] CSV export respects role scope
- [ ] CSV import is idempotent on phone
- [ ] AJAX status response includes `ok, status, stage_changed, new_stage, new_badges[]`
- [ ] Every status change appends to `lead_stage_history` with actor
