# 11 — Daily Reports

> Source: `routes/report_routes.py`, `helpers.py::_get_actual_daily_counts`, table `daily_reports`.

## 1. Purpose

Each approved team/leader member submits **one daily report per calendar day** summarizing their outreach: calls made, calls picked, enrollments, seat holds, etc. The system cross-references these user-entered numbers against activity-log-derived counts (tamper-proof) so admin can see discrepancies. Submitting the report awards **+20 points** and may trigger badge checks.

## 2. Schema — `daily_reports`

```sql
CREATE TABLE daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    upline_name TEXT DEFAULT '',
    report_date TEXT NOT NULL,             -- YYYY-MM-DD (IST)
    total_calling INTEGER DEFAULT 0,
    calls_picked INTEGER DEFAULT 0,
    calls_not_picked INTEGER DEFAULT 0,
    wrong_numbers INTEGER DEFAULT 0,
    leads_claimed INTEGER DEFAULT 0,
    enrollments_done INTEGER DEFAULT 0,
    pending_enroll INTEGER DEFAULT 0,
    underage INTEGER DEFAULT 0,
    leads_educated TEXT DEFAULT '',
    plan_2cc INTEGER DEFAULT 0,
    seat_holdings INTEGER DEFAULT 0,
    remarks TEXT DEFAULT '',
    pdf_covered INTEGER DEFAULT 0,          -- legacy column still summed in views
    submitted_at TEXT,
    videos_sent_actual INTEGER DEFAULT 0,   -- system cross-check fields
    calls_made_actual INTEGER DEFAULT 0,
    payments_actual INTEGER DEFAULT 0,
    system_verified INTEGER DEFAULT 0,
    UNIQUE(username, report_date)
)
```

The `UNIQUE(username, report_date)` constraint enforces the "one report per day per user" rule. UPSERT on conflict, so a user editing their report later simply rewrites the row.

## 3. `GET /reports/submit` — form

Loads:
- `existing = SELECT * FROM daily_reports WHERE username=? AND report_date=today` — if present, form is pre-filled (edit mode).
- `actual_counts = _get_actual_daily_counts(db, username)` — live system numbers shown next to each field so the user can reconcile.
- Renders `report_form.html`.

## 4. `POST /reports/submit`

### Form fields (all integers except textual)
```
report_date          (default today)
upline_name          (string — free-text display only)
total_calling        (int)
calls_picked         (int)
wrong_numbers        (int)
enrollments_done     (int)
pending_enroll       (int)
underage             (int)
plan_2cc             (int)
seat_holdings        (int)
leads_educated       (string)
remarks              (string)
leads_claimed        (optional — defaults to system value)
```

### Derived / system-verified
```python
calls_not_picked   = max(total_calling - calls_picked - wrong_numbers, 0)
sys_counts         = _get_actual_daily_counts(db, username, date=report_date)
sys_calls_made     = sys_counts['total_calling']
sys_leads_claimed  = sys_counts['leads_claimed']
sys_enrollments    = sys_counts['enrollments_done']
```

If the user omits `leads_claimed`, the system value is used directly.

### UPSERT
```sql
INSERT INTO daily_reports (... all fields ...,
    videos_sent_actual, calls_made_actual, payments_actual, system_verified)
VALUES (..., :sys_leads_claimed, :sys_calls_made, :sys_enrollments, 1)
ON CONFLICT(username, report_date) DO UPDATE SET
    ...all fields except id...,
    submitted_at = excluded.submitted_at,
    videos_sent_actual = excluded.videos_sent_actual,
    calls_made_actual = excluded.calls_made_actual,
    payments_actual = excluded.payments_actual,
    system_verified = 1
```

### Side effects
```python
_upsert_daily_score(db, username, 20)     # +20 points for report submit
_check_and_award_badges(db, username)     # may award "Daily Reporter" etc.
db.commit()
_log_activity(db, username, 'report_submit', f"Date: {report_date}")
flash('Daily report submitted successfully!', 'success')
redirect /  (team dashboard)
```

On `ValueError` (non-numeric input) → flash `"Please enter valid numbers."` and re-render the form.

## 5. `_get_actual_daily_counts(db, username, date=today)`

Tamper-proof system counts computed from `activity_log` + `leads` + `daily_scores`.

### Step 1 — replay call status events
```sql
SELECT details FROM activity_log
WHERE username=? AND event_type='call_status_update' AND DATE(created_at)=?
ORDER BY created_at ASC
```
Parse each row's `details` with two regexes:
- `Lead #(\d+)` → lead id
- `call_status=(.+)$` → new call status

Build `lead_last_status = {lead_id: most_recent_status}`. Last-wins when the same lead is updated multiple times in the day.

### Step 2 — bucket by last-known call status
```python
called_leads       = status ∈ _ALL_CALLING_REPORT    # any of CALL_STATUS_VALUES
picked_leads       = status ∈ _PICKED_STATUSES       # Called - Interested / Called - Follow Up / etc.
not_picked_leads   = status ∈ _NOT_PICKED_STATUSES   # Called - No Answer / Switch Off / Busy
wrong_number_leads = status == 'Wrong Number'
payment_leads      = status == 'Payment Done'
```

### Step 3 — leads claimed today
```sql
SELECT COUNT(*) FROM leads
WHERE assigned_user_id=:me_id AND DATE(claimed_at)=:date AND in_pool=0 AND deleted_at=''
```

### Step 4 — enrollments fallback
```sql
SELECT payments_collected FROM daily_scores WHERE username=? AND score_date=?
```
`enrollments = max(len(payment_leads), payments_collected)` — covers the case where a payment was recorded via score delta but no explicit `call_status=Payment Done` event exists.

### Return
```python
{
    'total_calling':    len(called_leads),
    'calls_picked':     len(picked_leads),
    'not_picked':       len(not_picked_leads),
    'wrong_numbers':    len(wrong_number_leads),
    'leads_claimed':    leads_claimed,
    'enrollments_done': enrollments,
}
```

These values power both the pre-fill helper on `/reports/submit` and the `*_actual` cross-check columns in `daily_reports`.

## 6. `GET /reports` — admin view

`@admin_required`. Query params:
- `date` — YYYY-MM-DD (daily view)
- `user` — username filter
- `view` ∈ `{daily, monthly}` (default `daily`)

### Query
```sql
SELECT * FROM daily_reports WHERE 1=1
  [AND report_date=?]    -- daily+date
  [AND username=?]
ORDER BY report_date DESC, submitted_at DESC
```

### Aggregates
```sql
SELECT
    COUNT(DISTINCT username || report_date) AS total_reports,
    SUM(total_calling)    AS total_calling,
    SUM(COALESCE(leads_claimed, pdf_covered)) AS leads_claimed,
    SUM(calls_picked)     AS calls_picked,
    SUM(enrollments_done) AS enrollments_done,
    SUM(plan_2cc)         AS plan_2cc
FROM daily_reports WHERE 1=1 [filters]
```

### Missing-today list
```python
submitted_today = [username from daily_reports WHERE report_date=today]
approved_team   = [username from users WHERE role='team' AND status='approved']
missing_today   = approved_team - submitted_today
```
This drives the "Not submitted yet" panel in the admin view.

### Trend (last 13 days)
```sql
SELECT report_date,
       COUNT(DISTINCT username) AS reporters,
       SUM(total_calling)       AS calling,
       SUM(enrollments_done)    AS enrolments
FROM daily_reports WHERE report_date >= date('now','-13 days')
GROUP BY report_date ORDER BY report_date ASC
```

### Monthly view
```sql
-- trend
SELECT strftime('%Y-%m', report_date) AS report_date,
       COUNT(DISTINCT username) AS reporters,
       SUM(total_calling)       AS calling,
       SUM(enrollments_done)    AS enrolments
FROM daily_reports WHERE report_date >= date('now','-365 days') [AND username=?]
GROUP BY strftime('%Y-%m', report_date)
ORDER BY report_date ASC

-- per-user totals
SELECT strftime('%Y-%m', report_date) AS month, username,
       SUM(total_calling), SUM(pdf_covered), SUM(calls_picked),
       SUM(enrollments_done), SUM(plan_2cc), COUNT(*) AS days_reported
FROM daily_reports WHERE 1=1 [AND username=?]
GROUP BY month, username
ORDER BY month DESC, username
```

## 7. `GET /leader/team-reports` — leader read-only view

Gate: `role in ('leader','admin')` (else redirect with flash).

Downline resolution:
- admin → all approved team+leader usernames
- leader → `_get_network_usernames(db, me) - me`

Date filter: `?date=YYYY-MM-DD` (default today IST).

Query:
```sql
SELECT dr.*, u.phone AS member_phone
FROM daily_reports dr
LEFT JOIN users u ON u.username = dr.username
WHERE dr.username IN (<downline placeholders>)
  AND dr.report_date = :date_filter
ORDER BY dr.submitted_at DESC
```
Read-only display — leader cannot edit team reports.

## 8. Scoring hook

`_upsert_daily_score(db, username, 20)` is called on every successful submit/upsert — including updates to an existing row. Because `daily_scores` uses its own upsert semantics (file 14), resubmitting the same day does NOT stack 40 points; the engine idempotently adds the delta to the row for that date if it isn't already there.

The activity log entry `event_type='report_submit'` is what the badge engine reads to award streaks and "Daily Reporter" style badges.

## 9. Cross-check philosophy

- User-entered numbers are **trusted but tagged** — the report row keeps both the human-entered value (`total_calling`, `enrollments_done`, `leads_claimed`) and the system-derived value (`calls_made_actual`, `payments_actual`, `videos_sent_actual`). Admin UIs show both side-by-side for variance analysis.
- There is no auto-reject on mismatch — that's deliberate. A user may legitimately make calls that aren't tracked (e.g., WhatsApp voice note) or mark a lead "Paid ₹196" outside the scope of an activity log event if the flow differed.
- `system_verified=1` is set on every submit to mark that cross-check fields were populated at write time (as opposed to legacy rows before the feature existed).

## Acceptance Checklist

- [ ] `daily_reports` has UNIQUE(`username`, `report_date`) constraint
- [ ] `POST /reports/submit` upserts on conflict — same day re-submit updates the row
- [ ] `calls_not_picked` is derived as `max(total_calling - calls_picked - wrong_numbers, 0)`
- [ ] System counts are stored in `calls_made_actual`, `videos_sent_actual`, `payments_actual` at write time
- [ ] `system_verified=1` on every submit
- [ ] Submit awards exactly +20 points via `_upsert_daily_score` (idempotent across resubmits)
- [ ] Submit calls `_check_and_award_badges` once per submit
- [ ] Submit writes `activity_log.report_submit` with the report date
- [ ] `_get_actual_daily_counts` reads only `activity_log.call_status_update` rows for the day
- [ ] Last-status-per-lead wins when parsing the day's call-status events
- [ ] `leads_claimed` count uses `DATE(claimed_at)=date` AND `in_pool=0 AND deleted_at=''`
- [ ] Enrollments = `max(payment_leads_count, daily_scores.payments_collected)`
- [ ] `/reports` admin view supports `view=daily|monthly` and optional `date`/`user` filters
- [ ] Admin missing-today list = approved team minus today's submitters
- [ ] Daily trend shows last 13 days; monthly trend shows last 365 days bucketed by `strftime('%Y-%m')`
- [ ] `/leader/team-reports` is read-only and scoped to downline (excludes the leader themselves)
- [ ] Non-numeric input re-renders the form with a flash rather than silently zeroing
