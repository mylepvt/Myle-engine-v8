# 06 — Workboard (Working section)

> Source: `app.py::working()` (lines ~5206 onward), templates `working.html`, `working_admin.html`, `working_leader.html`, `working_member.html`.
> Shows per-stage lead columns: Prospecting / Day1 / Day2 / Interview / Seat Hold / Closing.

## 1. Route

`GET /working` — one endpoint, three distinct render paths based on role. Re-reads role from DB on every hit (so admin-promoted users pick it up without re-login).

Before rendering:
1. `_check_seat_hold_expiry(db, username)` — auto-flips expired Seat Hold Confirmed to Pending.
2. Auto-expire sweep (per file 19):
   - admin → `_expire_all_pipeline_leads(db)`
   - leader → `_auto_expire_pipeline_leads_batch(db, [me] + downline)`
   - team → `_auto_expire_pipeline_leads(db, me)`

## 2. Admin view — `working.html` with `is_admin=True`

### Header summary
- `stage_counts`: prospecting / stage1 / day1 / day2 / day3 / pending / converted — single GROUP-BY query
- `total_pipeline_value` = `SUM(track_price)` WHERE status ∈ {Seat Hold Confirmed, Track Selected}
- `team_pipeline` — per-member table with today's score + streak (joins users + leads + daily_scores)
- `stale_leads` — `updated_at < now - 48h` AND status NOT IN closed/lost/seat-hold, ORDER BY updated_at ASC
- `batch_completion.d1_pct`, `d2_pct` — % of leads in Day1/Day2 with all 3 slots checked
- `admin_tasks` — open `admin_tasks` rows with done-by list

### Day-bucket lead lists (admin sees all)
```
admin_day1_leads: status='Day 1',
    ORDER BY (d1_morning+d1_afternoon+d1_evening) ASC, updated_at ASC
admin_day2_leads: status='Day 2',
    ORDER BY (d2_morning+d2_afternoon+d2_evening) DESC, updated_at ASC
admin_day3_leads: status IN ('Interview','Track Selected','Seat Hold Confirmed'),
    ORDER BY updated_at ASC
```
Each enriched with `hours_since_update` and `_enrich_leads()` (heat/next_action/priority).

### Today's claimed summary
`SELECT status, COUNT(*) WHERE claimed_at IS NOT NULL AND date(claimed_at) = today`, split into prospecting/enrolled/day1/day2/day3/seat_hold/converted.

### Batch videos
12 settings loaded from `app_settings`:
```
batch_d1_morning_v1,   batch_d1_morning_v2,
batch_d1_afternoon_v1, batch_d1_afternoon_v2,
batch_d1_evening_v1,   batch_d1_evening_v2,
batch_d2_morning_v1,   batch_d2_morning_v2,
batch_d2_afternoon_v1, batch_d2_afternoon_v2,
batch_d2_evening_v1,   batch_d2_evening_v2,
```
Each slot can have up to 2 videos. Also `enrollment_video_url` + `enrollment_video_title`.

Poll interval: `workboard_poll_ms=60000` (60s client-side refresh).

## 3. Leader view — `working_leader.html`

Two halves: **My Work (own leads)** and **Team Work (downline)**. The leader is NOT included in the downline set (`_downline_only = network - self`).

### Query pattern (per bucket, both halves)
- Own: `WHERE in_pool=0 AND deleted_at='' AND (assigned_user_id=:me_id OR stale_worker=:me_un OR current_owner=:me_un)`
- Team: `WHERE in_pool=0 AND deleted_at='' AND assigned_user_id IN (<downline ids>)`

Buckets (each LIMIT `LEADER_WORK_BUCKET_LIMIT`, typically 100):

| Bucket | Status filter |
|---|---|
| stage1 | `IN (ENROLLMENT_STATUSES ∪ ENROLLED_STATUSES)` — team half only; leader's prospecting lives in `/leads` |
| side | `IN (WORKING_SIDE_PIPELINE_STATUSES)` — Pending, Level Up, 2cc Plan |
| day1 | `= 'Day 1'` |
| day2 | `= 'Day 2'` + `hours_since_update` column |
| day3 | `IN ('Interview','Track Selected')` |
| pending | `= 'Seat Hold Confirmed'` |
| closing | `= 'Fully Converted'` |
| past | `IN ('Converted','Lost')` LIMIT `LEADER_WORK_PAST_LIMIT_*` |

After fetch, own+team lists are merged column-wise via `_leader_merge_workboard_columns()` — this produces the single Day1/Day2/Day3 grid shown at the top of the board.

### Side widgets
- `leader_today_actions`: `{pending_calls, videos_to_send, batches_due, closings_due}`
- `downline_members` — list of usernames+fbo_id
- `recent_shares` — last 15 `enroll_share_links` shared by this leader
- `team_leads_for_enroll` — all active leads in the leader's network (for the Enroll-To picker)
- `leader_tasks` — admin_tasks targeted at this leader / 'leader' / 'all' with per-user done flag
- `leader_batch_videos` — same 12-key settings map as admin
- `leader_fbo_id`, `app_tutorial_link` — for the "fully converted" tutorial link block
- `today_score`, `streak` — leader's own score row

## 4. Team (member) view — `working_member.html`

- Only `assigned_user_id = me.id` scope
- Columns: active prospecting, Day1 (read-only — leader handles), Day2 batches, follow-ups due today, closings
- **Batch buttons:**
  - Day 1 M/A/E buttons are **disabled** (leader/admin only flip Day1 batches)
  - Day 2 M/A/E buttons **enabled** for team on their own leads
  - Exception for team on Day1: they can only mark their own lead's batch via the share-link fallback (prospect opens the link → server auto-marks)
- Shows `today_score`, `streak`, follow-ups due, missed follow-ups counter

## 5. Batch-toggle endpoint

`POST /leads/<id>/batch-toggle` body: `slot=d1_morning|d1_afternoon|d1_evening|d2_morning|d2_afternoon|d2_evening&value=0|1`.

Rules:
- `slot` must be in the whitelist.
- Leads must have status matching the slot's day (`d1_*` requires `status='Day 1'`; `d2_*` requires `status='Day 2'`).
- Role gate:
  - `d1_*` slots: leader/admin only (team blocked with 403)
  - `d2_*` slots: team/leader/admin — provided they own the lead
- Updates the single INTEGER column, writes `updated_at = now_ist`, logs activity.
- If all 3 slots for a day become 1 AND status is still `Day 1`, award `DAY_BATCH_COMPLETE` points (idempotent per lead per day).
- If all 3 Day 2 slots become 1, trigger Day 2 test unlock (see file 10) — generates `test_token` and emails the candidate.

## 6. Batch share links (auto-mark on open)

`POST /leads/<id>/batch-share-url` body: `slot=d1_morning|…`.
Creates:
```sql
INSERT INTO batch_share_links (token, lead_id, slot, used, created_at)
VALUES (random_22char, ?, ?, 0, IST_NOW)
```
Returns `{ok:true, url:'https://<host>/b/<token>'}`.

When the prospect opens `GET /b/<token>`:
1. Lookup token; 404 if missing.
2. If `used=0`, find the lead and the slot column, set it to `1`, set `used=1`, bump `updated_at`.
3. Redirect to the corresponding batch video (based on `batch_<slot>_v1` setting). If not configured, fall back to `enrollment_video_url`.

Idempotent — reusing the link does NOT double-mark because `used=1` is checked first.

## 7. Stale Leads panel (admin)

Lists leads not touched in 48h AND not closed/lost/seat-hold. Admin can:
- Reassign (via bulk-action)
- Push to pool
- Set `stale_worker` (zero-risk reassign — only changes `stale_worker`, not `assigned_user_id`)

## 8. Seat Hold expiry check

`_check_seat_hold_expiry(db, username)` runs at the top of every `/working` hit:
```sql
SELECT id, seat_hold_expiry FROM leads
WHERE in_pool=0 AND deleted_at=''
  AND status='Seat Hold Confirmed'
  AND seat_hold_expiry != ''
  AND seat_hold_expiry < IST_NOW
```
For each, flip status to `Pending`, recompute `pipeline_stage = 'pending'`, clear `seat_hold_expiry`, log activity.

## 9. "Today" definition

Workboard's "Today's pipeline" uses `DATE(claimed_at) = :today_ist`. Leads claimed before today live in History tab on `/leads`, not on the workboard. This is why `claimed_at` is the primary "just worked on" anchor — it updates whenever:
- Pool claim (file 07)
- History-tab status change with `source_bucket=history` (file 05)
- Admin bulk reassign

## 10. Enrichment shape

`_enrich_leads(rows, db=db)` returns dicts with:
```json
{
  "id": 123, "name":"...", "phone":"...", "status":"Day 1",
  "assignee_username":"rohit",
  "heat_score": 72,
  "priority": "P1",
  "next_action": "Send Day 1 reminder",
  "ai_tip": "Call in next 15 min before interest cools",
  "hours_since_update": 3,
  ...all original columns...
}
```

## Acceptance Checklist

- [ ] `/working` re-reads role from DB (admin promotion takes effect without re-login)
- [ ] Seat hold expiry sweep runs at page open
- [ ] Auto-expire sweep runs at page open, scoped to role
- [ ] Admin sees `stage_counts`, `total_pipeline_value`, `team_pipeline`, `stale_leads`, batch completion %, admin tasks
- [ ] Admin Day1/Day2/Day3 lists ordered correctly (Day1 = fewest batches first, Day2 = most batches first)
- [ ] Leader view splits own vs team, merges column-wise
- [ ] Leader view excludes Day1-and-earlier own leads — those live on `/leads`
- [ ] Team view shows own leads only
- [ ] Day1 batch buttons are leader/admin-only; team blocked with 403
- [ ] Day2 batch buttons available to owner
- [ ] Completing all 3 Day1 slots awards `DAY_BATCH_COMPLETE` points once per lead per day
- [ ] Completing all 3 Day2 slots triggers Day 2 test unlock + token generation
- [ ] Batch share link is one-shot (`used=1` blocks double-mark)
- [ ] Batch share link redirects to configured batch video or falls back to enrollment video
- [ ] 12 batch video settings loaded in a single query
- [ ] Workboard polls every 60s on the client
- [ ] "Today" summary uses `DATE(claimed_at) = today_ist`
