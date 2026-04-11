# Myle App — Internal Wiring Optimization Plan

## Current State (Audit Summary)

| File | Lines | Role |
|------|------:|------|
| `app.py` | 5,159 | Main Flask app, dashboards, working section |
| `helpers.py` | 3,977 | Shared business logic, lead enrichment |
| `routes/lead_routes.py` | 3,444 | All lead CRUD operations |
| `database.py` | 1,913 | Schema, migrations, `get_db()` |
| `static/js/working.js` | 1,224 | Workboard UI logic |
| `templates/base.html` | 2,319 | Layout + ~800 lines inline JS |
| `templates/leads.html` | 2,189 | Lead listing page |
| `templates/dashboard.html` | 2,081 | Dashboard page |

**Core problems identified:**
1. DB connection opened/closed 5-10+ times per request (no request-scoped reuse)
2. N+1 query loops (per-member queries in admin/leader dashboards)
3. Same business logic copy-pasted across 3-8 locations
4. Heavy context processor runs ~165 lines of queries on every page
5. `_get_network_usernames` uses BFS with per-node queries (O(n) round-trips) vs existing recursive CTE
6. `_enrich_leads` opens its own DB connection (called 6x on team dashboard)

---

## Phase 1: Request-Scoped DB Connection (HIGHEST IMPACT, SAFEST)

**Problem:** Every `get_db()` call opens a new SQLite connection, runs 3 PRAGMAs, then closes later. One page load = 5-15 connect/close cycles.

**Fix:** Use Flask's `g` object to reuse one connection per request.

```python
# database.py — new pattern
from flask import g, current_app

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE, check_same_thread=False)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=5000")
        g.db.execute("PRAGMA cache_size=-4000")
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# In app.py (after app creation):
# app.teardown_appcontext(close_db)
```

**What changes across codebase:**
- Remove ALL manual `db.close()` calls from routes, helpers, decorators
- Remove `db = get_db()` + `db.close()` from `_enrich_leads` (just call `get_db()`)
- Remove `db.close()` from `_check_session_valid` in decorators.py
- Remove try/finally db.close() blocks (teardown handles it)
- Background threads that need DB must use `app.app_context()` wrapper

**Risk:** LOW — standard Flask pattern. Only risk is background threads (lead_pool has some `_bg_*` helpers).
**Impact:** HIGH — eliminates 80% of connection churn. Every page loads faster.

**Files to change:** `database.py`, `app.py` (2 lines), `decorators.py`, `helpers.py`, all `routes/*.py`

---

## Phase 2: Fix `_enrich_leads` to Accept Caller's DB

**Problem:** `_enrich_leads` does `from database import get_db; db = get_db()` — opens its own connection. Called 6x on team dashboard = 6 extra connections.

**Fix:** After Phase 1 this auto-resolves (get_db returns g.db). But also add explicit `db` parameter for clarity:

```python
def _enrich_leads(lead_list, db=None):
    if db is None:
        db = get_db()
    # ... rest unchanged, remove db.close()
```

**Risk:** VERY LOW
**Impact:** MEDIUM — removes 6+ extra connections on dashboard pages

---

## Phase 3: Kill `_get_network_usernames` BFS Loop

**Problem:** `_get_network_usernames` does BFS with 2 DB queries per tree node. 50-member org = 100 queries. Meanwhile `_get_downline_usernames` already does the same thing in ONE recursive CTE query.

**Fix:** Replace `_get_network_usernames` with `_get_downline_usernames`:

```python
def _get_network_usernames(db, username):
    return _get_downline_usernames(db, username)
```

**Verify first:** Check all callers to ensure both functions are expected to return the same set. The BFS version includes the user themselves — so does the CTE version. They should be equivalent.

**Risk:** LOW — verify output parity with a quick test on real data
**Impact:** HIGH for leaders with large downlines (100 queries → 1 query)

**Files to change:** `helpers.py` only

---

## Phase 4: Batch N+1 Queries in Admin/Leader Dashboards

### 4a. Admin Dashboard — `team_board` loop (~line 1489-1524 in app.py)

**Problem:** For each approved member: `user_id_for_username` + `_get_today_score` + 1 aggregate + 4 COUNT queries = ~7 queries × N members.

**Fix:**
```python
# Before the loop:
all_usernames = [m['username'] for m in approved_members]
id_map = user_ids_for_usernames(db, all_usernames)

today = _today_ist().isoformat()
score_rows = db.execute(
    f"SELECT username, total_points FROM daily_scores WHERE score_date=? AND username IN ({','.join('?'*len(all_usernames))})",
    [today] + all_usernames
).fetchall()
score_map = {r['username']: r['total_points'] for r in score_rows}

# In the loop: use id_map[uname] and score_map.get(uname, 0)
```

### 4b. Leader Dashboard — downline snapshot loop (~line 2051-2091)

Same pattern: pre-fetch all user IDs, scores, and lead counts in batched queries.

### 4c. Working section — today scores loop (~line 4379-4392)

Same: batch `daily_scores` query for all usernames.

**Risk:** MEDIUM — need careful SQL rewrite, test with real data
**Impact:** HIGH — admin dashboard with 20 members goes from ~140 queries to ~10

---

## Phase 5: Optimize Context Processor

**Problem:** `inject_global_data()` (~165 lines) runs on EVERY rendered page. Does inactivity check, scores, badge counts, follow-up counts, leader downline lost count.

**Fix (incremental):**
1. **Enable layout cache by default** — set `MYLE_LAYOUT_CACHE_SEC=3` in production. Already built, just not enabled. This alone cuts repeated nav queries by 90%.
2. **Skip inactivity on non-HTML** — add early return for JSON/API requests
3. **Memo per request** — store result on `g` so route handlers can reuse instead of re-querying

```python
# At top of inject_global_data:
if request.path.startswith('/api/') or request.is_json:
    return empty

# Store on g for route reuse:
g._layout_data = out
return out
```

**Risk:** LOW
**Impact:** MEDIUM — especially with cache enabled

---

## Phase 6: Centralize Repeated Business Logic

### 6a. Approved users dropdown query (3 locations → 1 helper)

```python
# helpers.py
def get_assignable_users(db):
    return db.execute(
        "SELECT username AS name FROM users WHERE role IN ('team','leader') AND status='approved' ORDER BY username"
    ).fetchall()
```

Replace in: `lead_routes.py` ~213, ~339, ~832

### 6b. Lead access check (8 locations → 1 helper)

```python
def assert_lead_visible(db, lead_row, actor_username, actor_role):
    """Raise 403 if actor cannot see this lead."""
    ...
```

### 6c. WhatsApp phone normalization (4 locations → 1 function)

```javascript
// static/js/utils.js
function normalizeWhatsAppPhone(phone) {
    let p = (phone || '').replace(/\D/g, '');
    if (p.length === 10) p = '91' + p;
    return p;
}
```

Replace in: `working.js` ~619, ~661, ~886, ~1023

### 6d. Pipeline status order (2 locations → 1 constant)

Move `FORWARD_ORDER` to `helpers.py` and import in `enrollment_routes.py`.

**Risk:** LOW per change
**Impact:** MEDIUM — prevents future bugs from logic drift

---

## Phase 7: Add Missing DB Index

```sql
CREATE INDEX IF NOT EXISTS idx_leads_test_token
ON leads(test_token) WHERE TRIM(COALESCE(test_token,'')) != '';
```

**Risk:** VERY LOW
**Impact:** LOW-MEDIUM — speeds up Day 2 test lookups

---

## Phase 8: Frontend Cleanup (LOWER PRIORITY)

### 8a. Move inline JS from base.html to static files
- ~800 lines of inline JS → `static/js/core.js` (cacheable, versionable)
- Keep only CSRF token injection inline

### 8b. Split working.js by concern
- `working-kanban.js` — tab/zone logic
- `working-batch.js` — batch popup, WhatsApp
- `working-admin.js` — admin-only functions

### 8c. Extract repeated template blocks
- Performance alerts block → `_perf_alerts.html` include
- Lead card markup → macro in `_macros.html`

**Risk:** LOW but time-consuming
**Impact:** MEDIUM — better caching, easier debugging

---

## Execution Order (Safest First)

| Step | Phase | Est. Time | Risk | Impact |
|------|-------|-----------|------|--------|
| 1 | Phase 1: Request-scoped DB | 1-2 hrs | LOW | ★★★★★ |
| 2 | Phase 2: _enrich_leads db param | 15 min | VERY LOW | ★★★ |
| 3 | Phase 3: Kill BFS network walk | 30 min | LOW | ★★★★ |
| 4 | Phase 5: Context processor cache | 30 min | LOW | ★★★ |
| 5 | Phase 7: Add test_token index | 5 min | VERY LOW | ★★ |
| 6 | Phase 4: Batch N+1 queries | 2-3 hrs | MEDIUM | ★★★★★ |
| 7 | Phase 6: Centralize logic | 1-2 hrs | LOW | ★★★ |
| 8 | Phase 8: Frontend cleanup | 3-4 hrs | LOW | ★★ |

**Total estimated:** ~10-12 hours of work across 8 phases

---

## Rules for Each Phase

1. **One phase = one commit** — easy rollback if something breaks
2. **Test after each phase** — login as admin, leader, team; check dashboard loads
3. **Background threads** — Phase 1 needs special care for `_bg_*` functions in lead_pool_routes.py
4. **No feature changes** — pure refactoring, zero UI changes
5. **Measure before/after** — add simple timing log to see improvement

---

## Expected Results

| Metric | Before (est.) | After (est.) |
|--------|--------------|-------------|
| DB connections per page | 5-15 | 1 |
| Queries on admin dashboard (20 members) | ~140 | ~15 |
| Queries on leader dashboard (10 downline) | ~80 | ~10 |
| Context processor queries per page | 5-8 | 0 (cached) or 5-8 (first load) |
| `_get_network_usernames` (50 members) | ~100 queries | 1 query |
