# 08 — Enrollment Video & Share Links

> Source: `routes/enrollment_routes.py`, `enroll_content` + `enroll_share_links` tables, app settings `enrollment_video_url` / `enrollment_video_title` / `batch_<slot>_v{1,2}`.

## 1. Purpose

The **Enroll To** feature lets a team/leader send a curiosity-titled video to a specific prospect. When they generate the link, the lead's pipeline auto-advances to `Video Sent`. When the prospect opens the link for the first time, it auto-advances to `Video Watched` and pings the sharer. This is a one-shot, idempotent flow — each token can only move a lead forward once.

## 2. Content library — `enroll_content`

Admin-managed table of videos available for the Enroll To picker:
```sql
CREATE TABLE enroll_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,                 -- internal title
    curiosity_title TEXT,       -- the headline shown to the prospect
    youtube_url TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT
)
```
Also `enroll_pdfs` for PDF alternatives with the same shape.

## 3. Share link — `enroll_share_links`

```sql
CREATE TABLE enroll_share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,              -- secrets.token_urlsafe(16) (~22 char)
    lead_id INTEGER,                -- nullable (generic share)
    content_id INTEGER,
    shared_by TEXT,                 -- username
    view_count INTEGER DEFAULT 0,
    created_at TEXT,
    synced_to_lead INTEGER DEFAULT 0,   -- one-shot "Video Sent" guard
    watch_synced INTEGER DEFAULT 0,     -- one-shot "Video Watched" guard
    lead_status_before TEXT             -- status at share time, for audit
)
```

Both one-shot flags are critical. They prevent duplicate status bumps and duplicate point awards even if the prospect opens the link many times or the team member re-clicks "Generate Link".

## 4. `POST /enroll/generate-link`

Body (JSON or form): `lead_id` (optional int), `content_id` (optional int).

### Flow
```python
token = secrets.token_urlsafe(16)
INSERT INTO enroll_share_links(token, lead_id, content_id, shared_by, view_count=0)

_sync_enroll_share_to_lead(db, token, username)   # may bump lead + award points
UPDATE daily_scores SET enroll_links_sent = COALESCE(enroll_links_sent,0) + 1
    WHERE username=? AND score_date=today
COMMIT

return {ok:true, token, watch_url: _public_external_url('watch_video', token=token)}
```

### `_sync_enroll_share_to_lead()` rules

1. Load link. If not found or `synced_to_lead=1` → no-op.
2. If `lead_id` is NULL (generic share with no target): award +10 points + `delta_videos=1`, set `synced_to_lead=1`, return.
3. Load lead. If missing, not active, or deleted → no-op.
4. **Forward-only status advance** using FORWARD_ORDER:
   ```
   New Lead, New, Contacted, Invited,
   Video Sent, Video Watched, Paid ₹196, Mindset Lock,
   Day 1, Day 2, Interview, Track Selected,
   Seat Hold Confirmed, Fully Converted, Training, Converted, Lost, Retarget
   ```
   - If current idx < `Video Sent` idx → set `status='Video Sent', call_status='Video Sent', pipeline_stage='enrollment', last_contacted=now, contact_count += 1, updated_at=now`.
   - Else (already Video Sent or beyond) → only bump `call_status='Video Sent'` if current call status is not already in the post-sent group (Video Sent / Video Watched / Payment Done).
5. Fetch content title (`curiosity_title` preferred, fallback `title`) for the audit log line `Video shared via Enroll To: "<title>"`.
6. `_log_lead_event` + `_log_activity('call_status_update', ...)`.
7. Award `_upsert_daily_score(username, +10, delta_videos=1)`.
8. `UPDATE enroll_share_links SET synced_to_lead=1, lead_status_before=<status at share time>`.

**Idempotency:** the `synced_to_lead` flag prevents a second call from re-running any of steps 4–8.

## 5. `GET /watch/<token>` — public prospect watch page

Token sanitization: strip to `[A-Za-z0-9_-]` (messaging apps sometimes append punctuation).

### Flow
1. Lookup `enroll_share_links WHERE token=?`.
2. **Fallback:** if no enroll link but a `batch_share_links` row matches, redirect to `/watch/batch/<slot>/1?token=<token>` so a batch link opened on the wrong URL still works.
3. If not found → render `watch_video.html` with `error='Link not found or expired'`, 404.
4. `is_first_view = (view_count == 0)`.
5. `UPDATE view_count = view_count + 1` (always).
6. If `is_first_view`:
   - `_sync_watch_event_to_lead(db, token)` — may bump lead to Video Watched.
   - `UPDATE daily_scores SET prospect_views = COALESCE(prospect_views,0) + 1 WHERE username=shared_by AND score_date=today`.
7. Fetch content row for title display.
8. Load global `enrollment_video_url` setting and convert via `_youtube_embed_url()` so the prospect sees the embedded enrollment video inside the app (no YouTube suggestions panel).
9. Render `watch_video.html` with `token, title=content.curiosity_title or content.title or "Video", embed_url, enrollment_video_url`.

### `_sync_watch_event_to_lead()` rules

1. Load link. If `watch_synced=1` or `lead_id` is NULL → no-op.
2. Load lead (active, not deleted).
3. **Forward-only advance**: if current status idx < `Video Watched` idx → set `status='Video Watched', call_status='Video Watched', pipeline_stage='enrollment', updated_at=now`.
   Already at or past Video Watched → no status change, but still fire the side effects below.
4. Fetch content `curiosity_title` for audit line `Prospect watched video: "<title>" — call them now.`
5. `_log_lead_event` + `_log_activity('call_status_update', ...)` attributed to `shared_by`.
6. `_upsert_daily_score(shared_by, +5)` — lower than the send award because the prospect action is less controllable by the rep.
7. Push notification to `shared_by` via `_push_to_users`:
   - Title: `<lead.name or "Lead"> watched the video!`
   - Body: `Call now — interest is at its peak!`
   - URL: `/working`
8. `UPDATE enroll_share_links SET watch_synced=1`.

**Idempotency:** second open only bumps `view_count`; `watch_synced=1` blocks re-awarding points or re-notifying.

## 6. `GET /watch/enrollment` — global fallback video

Public page (no token). Renders `watch_video.html` with `embed_url = _youtube_embed_url(enrollment_video_url setting)`. If the setting is empty or not a valid YouTube URL → 404 with `error='Video not configured'`.

Used as a generic "what is this program" link that doesn't attribute to a rep or a lead.

## 7. `GET /watch/batch/<slot>/<v>` — batch videos

Public page that shows `batch_<slot>_v{v}` (e.g., `batch_d1_morning_v1`). Slots must be in `_BATCH_SLOTS` whitelist; `v ∈ {1, 2}`.

### Token flow
If `?token=<batch_share_link_token>` is present:
1. Sanitize token to `[A-Za-z0-9_-]`.
2. `SELECT * FROM batch_share_links WHERE token=? AND used=0`.
3. If found and `link.slot == slot` → call `_mark_batch_done_for_lead(db, lead_id, slot)`:
   - No-op if slot column already `1` (idempotent).
   - `UPDATE leads SET <slot>=1, updated_at=now`.
   - Recompute `day1_done` / `day2_done`: 1 iff all three `d{1|2}_morning/afternoon/evening` flags are set for that day.
   - `_upsert_daily_score(owner, +15, delta_batches=1)` for the current assignee.
4. Note: the `used=1` flag is set by the main `/b/<token>` route (file 06). This handler is a safety net for direct batch URL hits.

### Video resolution
1. Load `batch_<slot>_v<v>` setting → convert via `_youtube_embed_url`.
2. **Fallback:** if `v=1` and its URL is missing/invalid, try `batch_<slot>_v2`. If that works, mark `fallback_used=True` and append "(using Video 2)" to the title.
3. If still nothing → 404 with `error='Video not configured'`.
4. Render `watch_batch.html` with `embed_url, title=_BATCH_LABELS[slot] + ' — Video ' + v, slot, v`.

## 8. `_youtube_embed_url()` helper

Converts `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, etc. into the minimal-UI embed form:
```
https://www.youtube.com/embed/<ID>?rel=0&modestbranding=1&controls=1&showinfo=0&iv_load_policy=3
```
Returns empty string for unparseable input. Used by every public video route so prospects never see YouTube's suggested-video panel.

## 9. Activity + score effects summary

| Event | Lead status | Score delta (shared_by) | Daily_scores column |
|---|---|---|---|
| Generate link (fresh lead) | → Video Sent | +10, `delta_videos=1` | `enroll_links_sent += 1` |
| Generate link (already past Video Sent) | unchanged | +10, `delta_videos=1` | `enroll_links_sent += 1` |
| First view (fresh) | → Video Watched | +5 | `prospect_views += 1` |
| First view (already past) | unchanged | +5 | `prospect_views += 1` |
| Second+ view | unchanged | 0 | 0 |

## 10. URL generation

Share URL is built via `_public_external_url('watch_video', token=token)` which returns an absolute `https://<public_host>/watch/<token>` — the public host comes from the `PUBLIC_EXTERNAL_HOST` setting so links stay clickable from outside the user's network.

## Acceptance Checklist

- [ ] `enroll_share_links` has UNIQUE(`token`), `synced_to_lead` default 0, `watch_synced` default 0, `view_count` default 0
- [ ] `/enroll/generate-link` is login-gated and creates a 22-char urlsafe token
- [ ] First generate-link call moves lead forward to `Video Sent` using FORWARD_ORDER (never backward)
- [ ] Second generate-link call for the same token is a no-op (guarded by `synced_to_lead`)
- [ ] Generic share (no `lead_id`) still awards +10 points and sets `synced_to_lead=1`
- [ ] Daily score `enroll_links_sent` increments exactly once per generated link
- [ ] `/watch/<token>` strips non-`[A-Za-z0-9_-]` chars from the token before lookup
- [ ] Invalid token that matches a `batch_share_links` row redirects to `/watch/batch/<slot>/1?token=…`
- [ ] First view moves lead to `Video Watched` via forward-only rule
- [ ] First view awards +5 to `shared_by` and `prospect_views += 1`
- [ ] First view sends a push notification to `shared_by` linking to `/working`
- [ ] Second+ view only bumps `view_count`; no re-award, no re-notify (guarded by `watch_synced`)
- [ ] `/watch/enrollment` renders embedded `enrollment_video_url` or 404 if unset
- [ ] `/watch/batch/<slot>/<v>` rejects unknown slots / v∉{1,2} with 404
- [ ] Batch token opened via `/watch/batch/...?token=` marks the slot done and recomputes `day1_done`/`day2_done`
- [ ] Video 1 missing → auto-fallback to Video 2 with title annotation
- [ ] All YouTube embeds use `rel=0&modestbranding=1` parameters (no suggested videos)
- [ ] Share URL uses `PUBLIC_EXTERNAL_HOST` for offsite reachability
