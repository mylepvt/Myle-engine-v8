# Myle Engine — Codebase Rules for AI Agents

This file is read by every AI session (Claude Code, Cursor, Copilot, etc.).
The sections marked **LOCKED** describe business-critical logic that must NEVER
be changed, refactored, removed, or "simplified" without explicit written
approval from the product owner. If a task appears to require touching a LOCKED
section, STOP and ask the user first.

---

## LOCKED: Lead Pipeline — Full Workflow

The following is the canonical, approved end-to-end lead pipeline.
No step, status, or ownership rule may be altered.

### Roles in the system
| Role | Description |
|------|-------------|
| `admin` | Full access, manages org |
| `leader` | Manages downline team, receives Day-2 handoff leads |
| `team` | Front-line caller, owns and works leads up to mindset lock |

### Lead ownership model (IMMUTABLE — DO NOT TOUCH)
- `owner_user_id` — permanently set on creation/pool-claim. **Never changes.** The DB event listener in `backend/app/models/lead.py` enforces this at write time. Do NOT remove or work around that event listener.
- `assigned_to_user_id` — mutable execution assignee. This is the only field that routing logic may update.

### Stage-by-stage workflow

```
[TEAM creates lead]
        ↓
new_lead → contacted → invited → whatsapp_sent → video_sent → video_watched
        ↓
      paid
        ↓
  mindset_lock   ← team member drives this 5-minute lock
        ↓
  [MINDSET LOCK COMPLETE — Day-2 Handoff fires]
  - assigned_to_user_id  → set to nearest upline LEADER
  - mindset_leader_user_id → set to that leader
        ↓
  day2 (leader works from here)
        ↓
  day3 / interview → track_selected → seat_hold
        ↓
    converted  ← terminal won state (admin/leader only)
```

**Lost / retarget / inactive** — terminal lost states, reachable from any stage.

### Who can set which statuses
- `team` — cannot set: day2, day3, day4, day5, interview, track_selected, seat_hold, converted, level_up, training, plan_2cc (enforced in `backend/app/core/lead_status.py::TEAM_FORBIDDEN_STATUS_SLUGS`)
- `leader` / `admin` — can set all statuses

---

## LOCKED: Leader → Team Conversion Lead Handoff

**File:** `backend/app/api/v1/team.py`
**Functions:** `_find_upline_leader()`, `update_member_role()`

### Exact approved rule (do not change any condition)

When admin calls `PATCH /api/v1/team/members/{id}/role` with `role = "team"`
and the user's previous role was `"leader"`:

1. Walk the converted user's `upline_user_id` chain to find the **nearest user
   with `role = "leader"`** (skipping any intermediate `team` members).
   Stop and return `None` if the chain reaches an `admin` or `None`.

2. If a nearest upline leader is found, reassign leads matching ALL of:
   - `assigned_to_user_id = converted_leader_id`  ← currently in that leader's queue
   - `owner_user_id != converted_leader_id`        ← Day-2 handoff (team member's lead, NOT leader's own)
   - `deleted_at IS NULL`
   - `in_pool = false`

   Set `assigned_to_user_id = upline_leader.id` for those rows.

3. If no upline leader exists → do nothing, leads stay as-is.

### What must NOT be changed
- The `owner_user_id` filter (`!= converted_leader_id`) must stay. Removing it
  would incorrectly transfer the leader's own personal leads.
- The `in_pool` filter must stay. Pool leads have their own routing logic.
- The upline walk must skip `team` members and stop at `admin`. Do not short-
  circuit to direct-upline-only.
- `owner_user_id` on any lead must never be updated here (it is immutable).

### Why this rule exists
Team members work a lead from new_lead through mindset lock. After mindset lock
the lead is handed off to a leader (`assigned_to_user_id = leader`). If that
leader is later downgraded to team, those in-progress Day-2 leads must continue
their journey under a real leader — the nearest one up the org tree. The
leader's own personally-created leads stay with them because they remain the
owner and can handle them as a team member.

### Cascade case (already handled — do not re-implement)
If the immediate upline was also previously converted to team, `_find_upline_leader`
automatically walks further up. When that second leader is later converted to
team, the same `PATCH /role` logic fires again and transfers their Day-2 leads
one level higher. No special cascade code is needed.

---

## LOCKED: `_find_upline_leader` — exact algorithm

```python
# backend/app/api/v1/team.py
async def _find_upline_leader(session, user):
    current_id = user.upline_user_id   # start from direct parent
    seen = set()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        upline = await session.get(User, current_id)
        if upline is None:
            return None
        if upline.role == "leader":
            return upline          # found — return immediately
        if upline.role == "admin":
            return None            # chain ends, no leader above
        current_id = upline.upline_user_id   # keep walking up
    return None
```

Do NOT replace this with a single `upline_user_id` lookup. It must walk the
full chain.

---

## LOCKED: `owner_user_id` immutability — DB event listener

**File:** `backend/app/models/lead.py` — `_prevent_owner_reassignment()`

This SQLAlchemy `before_update` event listener raises `ValueError` if any code
attempts to change `owner_user_id` once it has been set. It must never be
removed, bypassed, or have its condition weakened. This is the single source of
truth for permanent lead ownership.

---

## LOCKED: Test coverage for lead handoff

**File:** `tests/test_leader_to_team_conversion.py`

These tests encode the approved behaviour. Do NOT delete or modify the
assertions. If a test fails after a change, the change is wrong — fix the code,
not the test.

| Test | What it locks |
|------|---------------|
| `test_leader_to_team_transfers_day2_leads_to_upline_leader` | Day-2 leads go to upline leader; leader's own leads and pool leads stay |
| `test_leader_to_team_no_upline_leader_leaves_leads_unchanged` | Orphan leader — no transfer happens |

---

## General rules for AI agents

1. **Read this file before touching any file** in `backend/app/api/v1/team.py`,
   `backend/app/models/lead.py`, `backend/app/services/hierarchy_lead_sync.py`,
   `backend/app/services/user_hierarchy.py`, `backend/app/core/lead_status.py`.

2. **Never simplify or refactor LOCKED functions** even if they look verbose.
   The verbosity is intentional.

3. **Never remove a WHERE condition** from the lead update query in
   `update_member_role` without explicit product-owner approval.

4. **Always run** `tests/test_leader_to_team_conversion.py` after any change to
   `team.py` and confirm both tests pass before committing.

5. **Do not merge** any PR that removes or weakens a condition in the LOCKED
   sections above.
