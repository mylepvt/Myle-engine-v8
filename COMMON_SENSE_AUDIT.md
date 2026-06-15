# Myle Engine — Common-Sense Audit (Backend Services)

Date: 2026-06-15
Scope: Full read-only audit of `backend/app/services/` across 6 domains.
Status: 5/6 domains complete. Domain 6 (auth/access/security) pending — will be appended.

This report lists places where the automated logic is *technically* working but
behaves without "common sense" — i.e. it can be unfair, spammy, or wrong for real
users. Each item has a file:line, a plain explanation, and a severity.

Already fixed (PR #538, merged): central `report_eligibility` helper now excludes
removed/blocked/onboarding members from performer insights, inactive list, lead
activity, leader daily summary, reminders, compliance, automation member queries,
action-queue, and `send_push_to_roles`.

---

## TOP PRIORITY THEMES (fix first)

### THEME 1 — Money correctness (wallet / invoice) 🔴 HIGHEST
Real money, so these matter most.

- **Wallet double-charge on retry** — `wallet_service.py:71,92,265`
  `idempotency_key` is built from `datetime.utcnow().isoformat()`, so every retry
  gets a *new* key and nothing is de-duplicated. A network retry can deduct twice.
- **Negative balance / race condition** — `wallet_service.py:57-60,236-239`
  Balance is read then deducted with no row lock. Two concurrent claims can both
  pass the check and push the balance negative. No DB CHECK constraint either.
- **Invoice number race + NULL collisions** — `invoice_alloc.py:14-36`,
  `sales_service.py:229-236`, `lead_sale.py:59-60`
  Lock is acquired after the existence check, so two requests can create the same
  first row. `invoice_number` is `unique` but `nullable`, so many NULL invoices can
  pile up silently (breaks audit/fraud detection).
- **GST split rounding mismatch** — `invoice_html.py:179-218`
  Per-line GST is rounded individually, then total is computed separately; the two
  don't always reconcile (₹0.01 drift). Use integer paise / `Decimal` end-to-end.
- **Payment proof approved without amount sanity** — `payment_service.py:142-186`
  Approval only checks URL + status, not that the amount is sane (a ₹0 proof can be
  approved into a sale).

### THEME 2 — New members / trainees treated unfairly 🔴
An "agar koi naya hai to use abhi mat thopo" wala common sense missing in many places.

- **Missions generated for trainees** — `mission_service.py:152-185`
  Daily missions created for members still inside the 7-day training gate, then they
  get "missed mission" flags. (Doesn't use the new eligibility helper.)
- **Admin/leader headcount includes ineligible** — `mission_service.py:352-359,376-380`
  Team-size counts mix in blocked/onboarding members → completion rates look wrong.
- **"No Lead Activity = HIGH risk" with no age check** — `predictive_risk_service.py:148-156`
  A member who joined 2 days ago and was assigned leads is flagged critical risk for
  not touching them yet.
- **At-risk at 3 missed missions, no onboarding context** — `leader_command_center_service.py:70-90`
  A first-week member (missions start day 3) can trip this almost immediately.
- **Integrity: 0 logged calls = "fabrication"** — `performer_insights_service.py:248-254`
  If reported>0 but system-logged calls=0 (tracking lag / day 1), trust_score=0 and
  the member is flagged as a call-faker. Then composite is capped at 40
  (`:316-327`) even if every other metric is excellent.

### THEME 3 — Leads handed to people who can't work them 🔴
- **Reassign with no status check** — `leads_service.py:974-982`
  A lead can be reassigned to a blocked / unapproved / on-grace member; it just sits
  there unworked.
- **Downline queries return blocked/removed users** — `downline.py:36-81`,
  `user_hierarchy.py:100-112`, `lead_payloads.py:35-51`
  Hierarchy walks don't filter status, so leaders can hand off to hidden/blocked users.
- **Auto-handoff to unvalidated owner** — `auto_handoff.py:24-87`
  On lead-created / call-logged / payment-approved, the lead auto-assigns to the
  resolved owner without checking they're active.
- **Zombie-lead ignores reassignment time** — `lead_outcome_service.py:142-209`
  (also `predictive_risk_service.py` zombie count) A lead created 8 days ago but
  reassigned yesterday is flagged "stale" — pressure on someone who just got it.

---

## MEDIUM PRIORITY

### Compliance / discipline fairness
- **Leader auto-lockout, no grace/review** — `scheduled_jobs.py:380-495`
  14-day team streak → `access_blocked=True`, `discipline_status="removed"`,
  `removed_at=now`, automatically. No warning phase, no admin approval; a festival
  dip can lock out a good leader. Also only counts *direct* reports, not full downline.
- **Warning "whiplash" after a pause** — `member_compliance.py` (streak still
  computed while `discipline_warnings_paused()` is true) → members can emerge from a
  pause already at strong/final warning.
- **"Short on calls" ignores supply** — `member_compliance.py:220-228`,
  `team_tracking.py:69-95`, `live_metrics.py:84-109`
  Low call counts in a genuinely low-lead period look like laziness; no "had no
  leads available" context. Also pool-created (not owned) leads inflate "fresh lead"
  counts.

### Scoring fairness
- **Tiny-cohort percentiles** — `performer_insights_service.py:288-314`,
  `eos_health_service.py:132-144`
  In a 3-5 person window, percentile ranks and campaign-success % are noise; an
  "elite" in a 3-person team isn't elite org-wide. No minimum sample size.
- **Hard XP daily cap drops genuine wins** — `xp_service.py:248-252`
  300/day hard cap; a legit 350-point day loses the overflow, no carry-forward.
- **Idempotency bypass on lead_id=0** — `scoring_service.py:107-127`
  Falsy-but-valid `lead_id=0` skips the per-lead idempotency guard → possible
  re-award.
- **Org score hides outliers** — `org_execution_service.py:36-57`
  Simple average of leader scores; one critical leader is masked by many good ones.

### Timing / spam / dedupe
- **No weekend/holiday guard** — `scheduled_jobs.py` daily report reminder (21:00 IST)
  and call-target reminder (17:00 IST) fire every day, including Sundays/festivals.
- **No per-day dedupe** — reminders (`scheduled_jobs.py`),
  random reminder variant (`whatsapp_report_reminder.py:29-64`),
  final-warning alerts (`member_compliance.py:302-327`) can each send twice / daily
  for the same state → alert fatigue.
- **Action-queue repeats the same item daily** — `action_queue_service.py:70-87`
  Same untouched lead appears in every daily digest until manually resolved.
- **Reply matching window too small** — `whatsapp_removal.py:289-325`
  Inbound reply matched only against the last 20 removal records → replies can be
  orphaned/misattributed.

### Training / test / gate UX
- **One-shot 80% test, no retry** — `day2_test_bank.py:14,23-26`,
  `day2_test_service.py:67`
  24/30 to pass, `MAX_ATTEMPTS=1`; 6 wrong answers = permanent fail, no second chance.
- **Enrollment video = 1 view, hard dead, no warning** — `enrollment_video.py:35-37,95-109`
  One view then a dead link, no 50%-usage warning, no self-recovery.
- **Day-2 unlock off-by-one + UTC vs IST** — `training_surface.py:5,41,66`
  Day boundaries use UTC while the rest of the app uses IST; trainees can be locked a
  day longer than expected.
- **Verified-not-submitted stall** — `training_campaign_service.py:413-432`
  Enrollment only "completes" when a leader verifies evidence; no timeout/escalation,
  so it can sit "pending" forever if a leader forgets.
- **Upload size checked mid-stream** — `flp_min_billing_video_uploads.py:49-65`
  No Content-Length pre-check; a 512 MB upload fails after streaming most of it.

---

## LOWER PRIORITY / POLISH

- **`send_push_to_role` (singular) unfiltered** — `push_service.py:201-232`
  Plural form was fixed; singular still selects by role only (removed/blocked leaders
  can get FLP-billing pushes). Quick fix.
- **Silent `except Exception: pass`** — `scheduled_jobs.py:222-224,449-450,465-477`
  Real send/DB errors swallowed with no logging → hard to debug in prod.
- **Recursive downline cycle guard** — `user_hierarchy.py:115-133`
  Iterative upline walk caps at 64 with no visited-set; corrupt cyclic data behaves oddly.
- **Amount-in-words: "One Rupees", silent abs() on negatives** — `invoice_rupees_words.py:50-51,53,70`
- **Lexicographic date-string compare** — `blocker_intelligence_service.py:45-49`
  Compares datetime to ISO date string → possible off-by-one-day.
- **Mindset state not reset on manual status change** — `leads_service.py:257-269`
- **Duplicate-phone detection O(n) + format-sensitive** — `leads_service.py:453-469`,
  `lead_file_import.py:169-195` (re-import of same file can duplicate).
- **`broadcast_push` = `role != admin`** — `push_service.py:278-308` (design note).
- **CRM retry backoff has no jitter** — `crm_outbox.py:249` (thundering herd).
- **Activity feed seq unbounded + fire-and-forget persist** — `activity_feed.py:89-140`.

---

## Files reviewed and found OK
org_tree_service, member_activity_map, grace_intelligence, shell_insights,
team_reports_metrics, whatsapp_inbox, whatsapp_log_service, observation_logger,
lead_access, lead_owner, lead_scope, lead_pool_defaults, lead_pool_import,
batch_watch_uploads, hierarchy_lead_sync, workboard_service, payment_proof_storage,
sale_invoice_storage, certificate, day2_certificate_pdf, forever_invoice_ocr,
invoice_records, wallet_ledger, training_uploads, flp_min_billing_video,
gate_assistant, training_overview.

(Domain 6 — auth/access/settings/rule_engine/CTCS/storage — pending, will be appended.)
