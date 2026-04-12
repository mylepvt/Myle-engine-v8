# 02 — Database Schema

> Extracted from `/Users/karanveersingh/Downloads/Myle-Dashboard-main/database.py` (init_db + migrate_db).
> Types shown as they exist in SQLite. For Postgres: `TEXT`→`TEXT`, `INTEGER`→`INTEGER`/`BIGINT`, `REAL`→`NUMERIC(12,2)`.
> All timestamp defaults: `datetime('now','+5 hours','+30 minutes')` ≡ IST now.

## Timestamp convention

Every `*_at` column stores IST as ISO-ish text: `YYYY-MM-DD HH:MM:SS`. In a new stack, use `timestamp with time zone` in UTC and convert to IST at the edge, OR keep a naive timestamp in IST — pick one and be consistent. The old app chose IST-naive strings everywhere.

---

## Table: `leads`

Primary business table. **Invariant:** `in_pool = 1 OR assigned_user_id IS NOT NULL`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | |
| `name` | TEXT NOT NULL | | |
| `phone` | TEXT NOT NULL | | indexed; dedupe key |
| `email` | TEXT | `''` | |
| `referred_by` | TEXT | `''` | free text |
| `assigned_to` | TEXT NOT NULL | `''` | username (legacy string FK) |
| `assigned_user_id` | INTEGER | NULL | FK→users.id (canonical owner) |
| `source` | TEXT NOT NULL | `''` | see SOURCES list |
| `status` | TEXT NOT NULL | `'New'` | FSM state — see file 04 |
| `payment_done` | INTEGER NOT NULL | `0` | 0/1 |
| `payment_amount` | REAL NOT NULL | `0.0` | ₹ |
| `revenue` | REAL NOT NULL | `0.0` | total ₹ credited to this lead |
| `day1_done` | INTEGER | `0` | legacy 3-day funnel flags |
| `day2_done` | INTEGER | `0` | |
| `interview_done` | INTEGER | `0` | |
| `follow_up_date` | TEXT | `''` | `YYYY-MM-DD` |
| `follow_up_time` | TEXT | `''` | `HH:MM` |
| `call_result` | TEXT | `''` | last call outcome |
| `notes` | TEXT | NULL | free text |
| `city` | TEXT | `''` | |
| `deleted_at` | TEXT NOT NULL | `''` | soft delete; `''` = active |
| `in_pool` | INTEGER NOT NULL | `0` | 1 = shared pool |
| `pool_price` | REAL NOT NULL | `0.0` | ₹ to claim from pool |
| `claimed_at` | TEXT NULL | NULL | when team took from pool; NULL = never |
| `last_contacted` | TEXT | `''` | |
| `contact_count` | INTEGER | `0` | |
| `created_at` | TEXT NOT NULL | IST now | |
| `updated_at` | TEXT NOT NULL | IST now | bumped on every write |
| `d1_morning` | INTEGER | `0` | Day1 batch 1 done |
| `d1_afternoon` | INTEGER | `0` | Day1 batch 2 |
| `d1_evening` | INTEGER | `0` | Day1 batch 3 |
| `d2_morning` | INTEGER | `0` | Day2 batch 1 |
| `d2_afternoon` | INTEGER | `0` | Day2 batch 2 |
| `d2_evening` | INTEGER | `0` | Day2 batch 3 |
| `day1_batch` | TEXT | `''` | label |
| `day2_batch` | TEXT | `''` | |
| `day3_batch` | TEXT | `''` | |
| `working_date` | TEXT | `''` | YYYY-MM-DD the day it entered working |
| `daily_score` | INTEGER | `0` | |
| `pipeline_stage` | TEXT | `'enrollment'` | see STATUS_TO_STAGE in file 04 |
| `current_owner` | TEXT | `''` | username handling this stage |
| `call_status` | TEXT | `'Not Called Yet'` | see CALL_STATUS_VALUES in file 04 |
| `priority_score` | INTEGER | `0` | computed heat score |
| `track_selected` | TEXT | `''` | `Slow/Medium/Fast Track` |
| `track_price` | REAL | `0.0` | ₹ |
| `seat_hold_amount` | REAL | `0.0` | ₹ |
| `seat_hold_expiry` | TEXT | `''` | IST datetime |
| `pending_amount` | REAL | `0.0` | |
| `pipeline_entered_at` | TEXT | `''` | anchor for 24h auto-expire |
| `flow_started_at` | TEXT | `''` | set once on first ₹196 |
| `payment_proof_path` | TEXT | `''` | screenshot path |
| `payment_proof_approval_status` | TEXT | `'approved'` | `pending/approved/rejected` |
| `payment_proof_reviewed_by` | TEXT | `''` | |
| `payment_proof_reviewed_at` | TEXT | `''` | |
| `payment_proof_reject_note` | TEXT | `''` | |
| `enrolled_at` | TEXT | `''` | set ONCE, never overwritten |
| `enrolled_by` | TEXT | `''` | username |
| `retarget_assigned_by` | TEXT | `''` | leader who re-shared |
| `follow_up_missed_count` | INTEGER | `0` | discipline counter |
| `no_response_attempt_count` | INTEGER | `0` | 3 strikes → Retarget |
| `follow_up_miss_logged_for` | TEXT | `''` | date dedupe |
| `test_status` | TEXT | `'pending'` | Day2 business test |
| `test_score` | INTEGER | `0` | |
| `test_attempts` | INTEGER | `0` | |
| `test_completed_at` | TEXT | NULL | |
| `test_time_taken` | INTEGER | `0` | seconds |
| `test_token` | TEXT | `''` | public test link |
| `token_expiry` | TEXT | `''` | |
| `interview_status` | TEXT | `''` | `pending/cleared/rejected` |
| `stale_worker` | TEXT | `''` | zero-risk reassignment — assigned_user_id never changes |
| `stale_worker_since` | TEXT | `''` | |
| `stale_worker_by` | TEXT | `''` | admin who assigned |

**Check constraint:** `CHECK ((in_pool=1) OR (assigned_user_id IS NOT NULL AND assigned_user_id != 0))`

**Key indexes:**
- `idx_leads_pipeline(pipeline_stage, current_owner)`
- `idx_leads_pool_assigned(in_pool, assigned_to)`
- `idx_leads_pool_status(in_pool, status)`
- `idx_leads_payment(payment_done, in_pool)`
- `idx_leads_phone(phone)`
- `idx_leads_followup(follow_up_date, assigned_to)`
- `idx_leads_seat_hold(pipeline_stage, current_owner, seat_hold_expiry)`
- `idx_leads_active_uid_status(assigned_user_id, status, updated_at) WHERE in_pool=0 AND deleted_at=''`
- `idx_leads_pool_list(in_pool, updated_at) WHERE in_pool=1`
- `idx_leads_test_token(test_token) WHERE test_token != ''`

---

## Table: `users`

Auth + profile + downline graph + discipline state.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | INTEGER PK | | |
| `username` | TEXT UNIQUE NOT NULL | | login key |
| `password` | TEXT NOT NULL | | hashed (werkzeug/bcrypt/legacy-plain) |
| `role` | TEXT NOT NULL | `'team'` | `admin/leader/team` |
| `fbo_id` | TEXT | `''` | MyLyf FBO ID, used as login + dedupe |
| `upline_name` | TEXT | `''` | legacy |
| `upline_username` | TEXT | `''` | canonical parent link |
| `upline_fbo_id` | TEXT | `''` | parent's FBO ID |
| `phone` | TEXT | `''` | |
| `email` | TEXT | `''` | |
| `status` | TEXT | `'pending'` | `pending/approved/rejected/removed` |
| `display_picture` | TEXT | `''` | URL/path |
| `calling_reminder_time` | TEXT | `''` | `HH:MM` for daily push |
| `training_required` | INTEGER | `0` | |
| `training_status` | TEXT | `'not_required'` | `not_required/in_progress/completed` |
| `joining_date` | TEXT | `''` | YYYY-MM-DD anchors training |
| `certificate_path` | TEXT | `''` | |
| `certificate_blob` | TEXT | `''` | base64 PDF (ephemeral disk workaround) |
| `badges_json` | TEXT | `'[]'` | JSON array of badge keys |
| `total_points` | INTEGER | `0` | |
| `user_stage` | TEXT | `'day1'` | training day pointer |
| `last_activity_at` | TEXT | `''` | |
| `test_score` | INTEGER | `-1` | training test |
| `test_attempts` | INTEGER | `0` | |
| `discipline_status` | TEXT | `''` | `warned/grace/locked/removed` |
| `grace_reason` | TEXT | `''` | |
| `grace_return_date` | TEXT | `''` | |
| `grace_started_at` | TEXT | `''` | |
| `low_performance_days` | INTEGER | `0` | |
| `low_perf_tracked_date` | TEXT | `''` | |
| `access_blocked` | INTEGER | `0` | 1 = cannot log in |
| `performance_flagged` | INTEGER | `0` | |
| `low_effort_days` | INTEGER | `0` | |
| `low_effort_tracked_date` | TEXT | `''` | |
| `final_warning_given` | INTEGER | `0` | |
| `idle_hidden` | INTEGER | `0` | |
| `inactivity_72h_start_date` | TEXT | `''` | |
| `day1_routing_on` | INTEGER | `0` | |
| `created_at` | TEXT | IST now | |

Indexes: `idx_users_status`, `idx_users_upline(upline_username, status)`.

---

## Table: `daily_reports`

Self-reported metrics + system-verified actuals. `UNIQUE(username, report_date)`.

| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `username` | TEXT | |
| `upline_name` | TEXT | |
| `report_date` | TEXT | YYYY-MM-DD |
| `total_calling` | INTEGER | self |
| `pdf_covered` | INTEGER | self |
| `calls_picked` | INTEGER | self |
| `wrong_numbers` | INTEGER | self |
| `enrollments_done` | INTEGER | self |
| `pending_enroll` | INTEGER | self |
| `underage` | INTEGER | self |
| `leads_educated` | TEXT | CSV lead IDs |
| `plan_2cc` | INTEGER | self |
| `seat_holdings` | INTEGER | self |
| `remarks` | TEXT | |
| `videos_sent_actual` | INTEGER | `-1`=not computed; system count |
| `calls_made_actual` | INTEGER | system count |
| `payments_actual` | INTEGER | system count |
| `system_verified` | INTEGER | 1 once cross-checked |
| `calls_not_picked` | INTEGER | |
| `leads_claimed` | INTEGER | system count |
| `submitted_at` | TEXT | IST |

---

## Table: `wallet_recharges`

Recharge requests. Ledger lives in a separate table (see file 09).

| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `username` | TEXT | |
| `amount` | REAL | ₹ |
| `utr_number` | TEXT | manual bank ref |
| `status` | TEXT | `pending/approved/rejected` |
| `requested_at` | TEXT | |
| `processed_at` | TEXT | |
| `admin_note` | TEXT | |

Index: `idx_wallet_user_status(username, status)`.

---

## Table: `announcements`

| id | message | created_by | pin(0/1) | created_at |

---

## Table: `lead_notes`

Timeline log per lead.

| id | lead_id | username | note | created_at |

Index: `idx_lead_notes_lead(lead_id, created_at)`.

---

## Table: `activity_log`

Punch log for audit + inactivity detection.

| id | username | event_type | details | ip_address | created_at |

Index: `idx_activity_user_time(username, created_at)`.

---

## Table: `push_subscriptions`

| id | username | endpoint UNIQUE | auth | p256dh | created_at |

---

## Table: `password_reset_tokens`

| id | username | token UNIQUE | expires_at | used(0/1) | created_at |

---

## Table: `training_videos`

One row per training day (1–7).

| id | day_number UNIQUE | title | youtube_url | podcast_url | pdf_url | podcast_blob | pdf_blob | description | created_at |

---

## Table: `training_progress`

`UNIQUE(username, day_number)`

| id | username | day_number | completed(0/1) | completed_at |

---

## Table: `training_questions`

| id | question | option_a | option_b | option_c | option_d | correct_answer | sort_order | created_at |

---

## Table: `training_test_attempts`

| id | username | score | total_questions | passed(0/1) | attempted_at |

---

## Table: `day2_questions`

30 business-eval questions for Day 2 test (gate before Interview).

| id | question_text | option_a..d | correct_option | created_at |

---

## Table: `targets`

`UNIQUE(username, metric, month)`

| id | username | metric | target_value | month (YYYY-MM) | created_by | created_at |

---

## Table: `user_badges`

`UNIQUE(username, badge_key)`

| id | username | badge_key | unlocked_at |

---

## Table: `point_history`

Append-only points ledger with two unique idempotency guards.

| id | username | action_type | points | description | lead_id | created_at |

**Unique indexes:**
- `ux_ph_idem_day(username, action_type, lead_id, DATE(created_at)) WHERE lead_id > 0` — one award per lead per day per action
- `ux_ph_idem_lifetime(username, action_type, lead_id) WHERE lead_id > 0 AND action_type='CONVERSION'` — CONVERSION only once per lead forever

---

## Table: `daily_scores`

`UNIQUE(username, score_date)` — per-day rollup for leaderboard.

| id | username | score_date | calls_made | videos_sent | batches_marked | payments_collected | total_points | streak_days | enroll_links_sent | prospect_views | created_at |

---

## Table: `enroll_content`

Video/PDF config for Enroll-To share.

| id | curiosity_title | title | is_active | day_number | sort_order | created_at |

## Table: `enroll_pdfs`

| id | title | url | is_active | sort_order | created_at |

---

## Table: `enroll_share_links`

Token-per-share. One-shot sync to lead status.

| Column | Notes |
|---|---|
| `id` PK | |
| `token` UNIQUE | random 22-char |
| `lead_id` | FK→leads.id |
| `content_id` | FK→enroll_content.id |
| `shared_by` | username |
| `view_count` | incremented on each `/watch/<token>` hit |
| `lead_status_before` | status before share (for rollback reference) |
| `synced_to_lead` | 0/1 — set to 1 first time lead status advances to "Video Sent" |
| `watch_synced` | 0/1 — set to 1 first time a view triggers "Video Watched" |
| `created_at` | |

---

## Table: `batch_share_links`

Used for Day1/Day2 batch share (prospect opens link → auto-mark that slot).

| id | token UNIQUE | lead_id | slot (`d1_morning`…`d2_evening`) | used(0/1) | created_at |

---

## Table: `bonus_videos`

| id | title | youtube_url | description | sort_order | created_at |

---

## Table: `lead_stage_history`

Audit trail of every pipeline_stage transition.

| id | lead_id | stage | owner | triggered_by | created_at |

Index: `idx_stage_history_lead(lead_id)`.

---

## Table: `lead_assignments`

Every ownership change.

| id | lead_id | assigned_to (user id) | previous_assigned_to | assigned_by (username) | assign_type (`claim/pool_to_team/retarget/admin/…`) | reason | created_at |

Unique: `(lead_id, COALESCE(assigned_to,-1), assign_type, created_at)`.

---

## Table: `admin_tasks`

Admin-created work items.

| id | kind | title | payload_json | due_at | created_by | created_at |

## Table: `admin_task_done`

| id | task_id | done_by | done_at |

---

## Table: `user_grace_history`

Discipline grace periods.

| id | username | reason | started_at | return_date | ended_at | created_by |

## Table: `admin_decision_snapshots`

| id | scope | payload_json | created_at |

## Table: `system_auto_actions`

| id | action_type | username | lead_id | details | created_at |

## Table: `leaderboard_summaries`

| id | period (`day/week/month`) | period_key | payload_json | created_at |

---

## Table: `app_settings`

Key-value store for runtime config (toggleable from admin UI).

| key | value |

Typical keys:
- `lead_pool_default_price` — ₹
- `wallet_min_recharge` — ₹
- `enroll_video_url_day1` … `enroll_video_url_day7`
- `razorpay_enabled` — `0/1`
- `push_enabled` — `0/1`
- `daily_call_target` — int
- `intelligence_enabled` — `0/1`

---

## Table: `team_members`

Legacy; original contact book. Still created but mostly unused.

| id | name UNIQUE | phone | joined_at |

---

## Seed Data (boot-time)

1. **Admin user** (if no admin exists):
   ```
   username = 'admin'
   password = generate_password_hash('admin123')
   role     = 'admin'
   status   = 'approved'
   ```
2. **Training questions** — 7 default MCQs inserted if table empty.
3. **Day 2 questions** — 5 default questions inserted if empty (see `database.py` line 1296).
4. **Enroll content** — admin can add rows from Settings; none seeded.

---

## Acceptance Checklist

- [ ] Every table listed above exists after `init_db()` + `migrate_db()` on a fresh DB
- [ ] `leads` CHECK constraint blocks inserts with `in_pool=0 AND assigned_user_id IS NULL`
- [ ] `daily_reports` rejects duplicate `(username, report_date)`
- [ ] `training_progress` rejects duplicate `(username, day_number)`
- [ ] `user_badges` rejects duplicate `(username, badge_key)`
- [ ] `point_history` unique indexes prevent double awards same day and double CONVERSION ever
- [ ] `enroll_share_links.token` is unique and 22+ chars
- [ ] All `_at` columns default to IST now
- [ ] Indexes listed above are present (performance)
- [ ] Default admin seeded on empty DB
