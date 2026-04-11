# Live verification checklist (post-deploy)

Code-side: payment normalization, bulk safety, validation, migrations, and tests should stay green. **Production is “proven” only when live behavior matches.**

## Already solid (design)

- **Payment:** `payment_done` ↔ `payment_amount` via `normalize_lead_payment_row` / `payment_fields_after_status_change`; bulk `mark_paid` per-lead derive; Mindset bulk skips paid leads.
- **Dashboard “today” (admin):** `today` = `_today_ist().isoformat()`; filters use `sql_ts_calendar_day()` on `leads.updated_at` so calendar day matches **IST wall-clock** strings written by `_now_ist()`.
- **Leads list “today/history” split:** `claimed_at` bounds use **IST date** (`_today_ist()`), not server local `datetime.now()`.

### `updated_at` contract (real risk)

**Today Calls** and **Today Enrollments** use **`date(substr(updated_at,…)) = today_IST`**. If a route changes `call_status` or `status` but **does not** bump `updated_at`, the dashboard can show “no call today” while reality is “call logged”.

Mitigations in code:

- `apply_call_outcome_discipline` always sets `updated_at` with the `call_status` write.
- **`POST /leads/<id>/call-status`** ends with **`touch_lead_updated_at`** so the row always gets a final IST timestamp before commit (safety net for future branches).
- New code: prefer `apply_leads_update` or explicitly set `updated_at = _now_ist()` on **every** `UPDATE leads` that reflects user-visible activity.

## TEST 1 — Today calls

**Expect:** Team ne aaj call log kiya → Command Center **Today Calls** ≈ wahi distinct leads jin par aaj valid `call_status` + `updated_at` ka **IST date** aaj hai.

**Implementation note:** Metric `LEAD_SQL_CALL_LOGGED` + `sql_ts_calendar_day(updated_at) = date(today_IST)`. Agar kisi flow ne call update kiye bina `updated_at` touch na kiya ho to count mismatch ho sakta hai — tab **updated_at leak** check karo us route par.

**Manual:** 1–2 leads par call status set karo → dashboard refresh → count badhe.

## TEST 2 — Today enrollment

**Expect:** Aaj kisi ko paid / enrollment path se mark kiya → **Today Enrollments** (aur amount) turant reflect ho.

**Implementation note:** Same `_ts = date(substr(updated_at,…)) = date(today_IST)` plus `status IN ('Paid ₹196','Mindset Lock') OR payment_done=1`.

**Manual:** Paid mark karo → refresh → enrollment count + amount check.

## TEST 3 — Midnight reset (IST)

**Expect:** India date badalne ke baad (raat 12 ke baad IST):

- Today Calls → **0** (jab tak nayi activity na ho).
- Today Enrollment → **0** (jab tak nayi enrollment na ho).

**Why:** `today` har request par `_today_ist()` se aata hai; purane rows ki `updated_at` **purani IST date** par rehti hai, isliye “aaj” filter unhe count nahi karta.

**Manual:** Deploy ke baad ek din boundary par ya early morning IST par dashboard open karke verify karo.

## Optional SQL (read-only, SQLite)

```sql
-- Calendar day from stored wall clock (same idea as sql_ts_calendar_day)
SELECT date(substr(trim(COALESCE(updated_at,'')), 1, 10)) AS d, COUNT(*) 
FROM leads WHERE deleted_at='' AND in_pool=0 
GROUP BY d ORDER BY d DESC LIMIT 3;
```

## Final decision rule

- Teenon live tests pass + DB health panel clean → **OK to treat system as verified.**
- Ek bhi steady mismatch → **stop**; trace `updated_at` on the route that should have fired.
