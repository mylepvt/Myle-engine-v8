# 10 — Training (7-Day Calendar + Test + Certificate)

> Source: `routes/training_routes.py`, tables `training_videos`, `training_progress`, `training_questions`, `training_test_attempts`, `bonus_videos`, `users.training_*` fields.

## 1. Lifecycle

Every new team/leader registration has `training_required=1` and starts with `training_status='pending'`. Training progresses through states:

```
pending  →  completed  →  unlocked
```

- `pending` — user is actively watching daily videos. The app is partially locked (most routes redirect to /training).
- `completed` — all 7 days ticked off, test not yet passed.
- `unlocked` — certificate uploaded; full app access granted.
- `not_required` — admin toggle (legacy user). Always unlocked.

## 2. Schema

```sql
users:
    training_required  INTEGER DEFAULT 0
    training_status    TEXT    DEFAULT 'not_required'
    joining_date       TEXT                    -- YYYY-MM-DD
    test_score         INTEGER DEFAULT -1      -- last test score; -1 = never attempted
    test_attempts      INTEGER DEFAULT 0
    certificate_path   TEXT    DEFAULT ''
    certificate_blob   TEXT    DEFAULT ''      -- base64 bytes (fallback for ephemeral FS)

training_videos:
    day_number   INTEGER PRIMARY KEY            -- 1..7
    title        TEXT
    youtube_url  TEXT
    podcast_url  TEXT          -- 'audio/dayN_podcast.mp3' or external URL
    pdf_url      TEXT
    podcast_blob TEXT          -- base64 fallback
    pdf_blob     TEXT
    description  TEXT

training_progress:
    username     TEXT
    day_number   INTEGER
    completed    INTEGER DEFAULT 0
    completed_at TEXT
    PRIMARY KEY (username, day_number)

training_questions:
    id, question, option_a, option_b, option_c, option_d,
    correct_answer TEXT,       -- 'a' | 'b' | 'c' | 'd'
    sort_order INTEGER

training_test_attempts:
    id, username, score, total_questions, passed, attempted_at

bonus_videos:
    id, title, youtube_url, description, sort_order
```

## 3. Calendar unlock rule

**Day N unlocks on `day1_completed_at + (N-1) days`.** This is the core discipline rule — users cannot burn through all 7 days in one sitting.

```python
def _day_unlock_dates(dates_dict):
    # dates_dict = {day_number: completed_at_str}
    if 1 not in dates_dict or not dates_dict[1]:
        return {}
    day1_date = date(dates_dict[1][:10])
    return {
        n: (day1_date + timedelta(days=n - 1)).strftime('%d %b %Y')
        for n in range(2, 8)
    }
```

Day 1 itself has no calendar gate — users start whenever they log in for the first time.

## 4. `GET /training` — team member view

### Branch A: `training_status ∈ ('not_required', 'unlocked')` — viewer mode
- Loads all 7 training videos (freely watchable).
- Loads `bonus_videos`.
- Loads direct downline rows where `u.training_required=1` AND upline matches this user (via username, upline_name, or upline_fbo_id) — so a leader can monitor their team's progress.
- Render `training.html` with `is_viewer=True`, `downline=<rows>`.

### Branch B: `pending / completed` — active trainee
- Load all 7 videos.
- `progress = _get_training_progress(db, me)` → `{day_number: completed}`.
- `dates = _get_training_dates(db, me)` → `{day_number: completed_at}`.
- `unlock_dates = _day_unlock_dates(dates)` for display of "Day N unlocks on <date>".
- `current_day = first incomplete day` (or 8 if all done).
- If all 7 done and `training_status != 'completed'|'unlocked'` → auto-promote to `completed`, update session.
- Sync `training_status` from DB into session (handles admin promotions).
- If all done → load bonus videos too.

Template fields: `videos, progress, current_day, current_video, all_done, training_status, joining_date, days=range(1,8), test_score, unlock_dates, bonus_videos`.

## 5. `POST /training/complete-day`

Form: `day_number` (1..7).

Gates:
1. `1 ≤ day ≤ 7`
2. All previous days (`1..day-1`) must be `completed=1` — can't skip ahead.
3. *(Implicit: calendar unlock gate is enforced by the UI hiding the button until the date; server does NOT re-check the date — legacy leniency.)*

### Insert
```sql
INSERT INTO training_progress(username, day_number, completed, completed_at)
VALUES (?, ?, 1, :now_ist)
ON CONFLICT(username, day_number) DO UPDATE SET completed=1, completed_at=:now_ist
```

If all 7 now complete → `UPDATE users SET training_status='completed'`, update session, flash "🎉 All 7 days complete! Take the training test — score 60/100 to unlock your certificate."

Otherwise flash `"✅ Day N complete! Keep going."`.

## 6. `GET /training/test`

Gate: `training_status in ('completed','unlocked')` — else redirect `/training` with warning.

Loads 20 random questions:
```sql
SELECT * FROM training_questions ORDER BY RANDOM() LIMIT 20
```
Renders with current `test_score` and `test_attempts` for display.

## 7. `POST /training/test/submit`

Gate: `training_status in ('completed','unlocked')`.

Loads ALL questions (deterministic order by id) — NOTE: this is the full pool, not the randomized 20. This is the legacy behavior; on rebuild, store the question IDs shown to the user in a session/record and score that subset. For now:
```python
for q in questions:
    ans = form.get(f'q_{q.id}', '').strip().lower()
    if ans == q.correct_answer.lower():
        correct += 1
score = int(correct / total * 100)
passed = 1 if score >= 60 else 0
```

### Persist
```sql
INSERT INTO training_test_attempts(username, score, total_questions, passed, attempted_at)
VALUES (?, ?, ?, ?, :now_ist)

UPDATE users SET test_score=?, test_attempts=test_attempts+1 WHERE username=?
```

Passed → flash success + redirect `/training/certificate`.
Failed → flash `"Score: X/100. Not passed — you need 60/100. Try again."` + redirect back to the test.

## 8. `GET /training/certificate`

Gates:
1. `training_status in ('completed','unlocked')`.
2. `test_score >= 60` (skipped if already `unlocked`).
3. Day 7 must be in `training_progress` with a `completed_at` timestamp → used for the completion date on the certificate.

### Certificate fields
```python
cert_number     = f"MYLE-{today_ist.year}-{username.upper()}"
completion_date = day7.completed_at → "%d %B %Y"
sig_url         = url_for('training_signature_preview')
joining_date    = users.joining_date
```

Renders `training_certificate.html`.

## 9. `POST /training/upload-certificate`

Finalizes training to `unlocked` state.

### Re-verify from DB (session may be stale)
```sql
SELECT training_status, test_score FROM users WHERE username=?
```
Block if `training_status not in ('completed','unlocked')` or (`completed` AND `test_score < 60`).

### File validation
- `certificate_file` must be present
- Extension ∈ `{pdf, jpg, jpeg, png}`
- Size ≤ 5 MB

### Storage (dual)
```python
file_bytes = f.read()
cert_blob  = base64.b64encode(file_bytes).decode('utf-8')   # ALWAYS stored in DB
filename   = f"{username}_cert.{ext}"

# Best-effort disk save (never blocks unlock on failure)
try: open(upload_root/'uploads/training_certs'/filename, 'wb').write(file_bytes)
except: logger.warning(...)  # continue

UPDATE users
SET training_status='unlocked',
    certificate_path=:filename,
    certificate_blob=:cert_blob
WHERE username=?
```

The DB blob is the source of truth — the disk copy is a cache for Render-like ephemeral filesystems. Any serve-certificate route should read blob first, disk second.

Update session → `training_status='unlocked'`. Redirect to `/` team dashboard.

## 10. Admin management

### `GET /admin/training`
Returns all videos keyed by day, the member list (`role='team' AND status='approved'`) with per-user `days_done` count, test questions, bonus videos, signature file name.

### `POST /admin/training/save-video`
Upsert `training_videos` for a day. Supports:
- `youtube_url` (main video)
- `podcast_file` upload OR `podcast_external_url` (mutually exclusive; uploaded blob stored base64)
- `pdf_file` upload OR `pdf_external_url` (same pattern)
- Existing blobs are preserved if no new file uploaded

### `POST /admin/training/<username>/toggle`
Flips `training_required`:
- `1 → 0`: sets `training_status='not_required'` (full access granted)
- `0 → 1`: sets `training_status='pending'` (locks account until completion)

### `POST /admin/training/<username>/reset`
```sql
DELETE FROM training_progress WHERE username=?
UPDATE users SET training_status='pending', certificate_path='', test_score=-1, test_attempts=0
  WHERE username=? AND training_required=1
```
User restarts from Day 1.

### Question CRUD
- `POST /admin/training/test/add-question` — question + 4 options + correct letter (a/b/c/d). Appends to sort_order.
- `POST /admin/training/test/delete-question/<qid>` — hard delete.

### Bonus video CRUD
- `POST /admin/training/save-bonus-video` — upsert by `vid_id`; requires `title` + `youtube_url`.
- `POST /admin/training/delete-bonus-video/<vid_id>` — hard delete.

### Signature
- `POST /admin/training/upload-signature` — PNG/JPG only. Saved to `uploads/admin/admin_signature.<ext>`, stored in `app_settings.admin_signature_file`.
- `GET /admin/training/signature-preview` — serves the file (or `static/admin_signature.png` fallback or 404).

## 11. Media serve with blob fallback

`GET /training/media/<path:filename>` (login-gated):
1. Try disk `uploads/training/<filename>`.
2. Fallback: lookup `training_videos` where `podcast_url=filename OR pdf_url=filename`, return base64-decoded blob with correct mimetype.
3. Last-resort: regex-match `audio/dayN_podcast.*` or `pdf/dayN_resource.pdf`, return blob by day_number.
4. Else 404.

Mimetype rule: `.mp3 → audio/mpeg`, else `audio/mp4` for audio; PDFs always `application/pdf`.

## 12. Session-vs-DB sync rule

Training status is checked from DB at every state-changing endpoint (test submit, certificate upload) because:
- User can open a new tab that still has an old session value.
- Admin can toggle/reset training mid-session.
- The session copy is refreshed at each check to keep subsequent route handlers correct.

## Acceptance Checklist

- [ ] New team/leader registration sets `training_required=1, training_status='pending'`
- [ ] `/training` in viewer mode (not_required / unlocked) shows all 7 videos + downline progress table
- [ ] `/training` in active mode computes `current_day` as first incomplete day
- [ ] Day unlock rule: Day N cannot be completed before `day1_completed_at + (N-1) days`
- [ ] `/training/complete-day` blocks skipping (must have days 1..N-1 complete)
- [ ] Completing day 7 auto-sets `training_status='completed'` and refreshes session
- [ ] `/training/test` requires status ∈ (completed, unlocked)
- [ ] Test passing threshold is `score >= 60` out of 100
- [ ] Each test attempt writes a `training_test_attempts` row and increments `test_attempts`
- [ ] `/training/certificate` requires test_score ≥ 60 unless already unlocked
- [ ] Certificate number format: `MYLE-<year>-<USERNAME_UPPER>`
- [ ] Completion date = `day 7 completed_at → "%d %B %Y"`
- [ ] Certificate upload accepts only pdf/jpg/jpeg/png up to 5 MB
- [ ] Certificate upload stores `certificate_blob` (base64) in DB as primary, disk as best-effort cache
- [ ] Successful upload sets `training_status='unlocked'` and updates session
- [ ] Admin `/admin/training/<user>/toggle` switches training_required and resets status correctly
- [ ] Admin reset deletes progress + clears test fields but only for `training_required=1` users
- [ ] `/training/media/<file>` falls back to DB blob if disk file missing
- [ ] Admin signature stored in `app_settings.admin_signature_file` and served by `/training/signature-preview`
