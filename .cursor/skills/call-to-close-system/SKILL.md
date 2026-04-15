---
name: call-to-close-system
description: Enforces an action-first lead calling workflow (Call → Outcome → auto update → next lead) with Lead Cards, one-click statuses, Call Mode, heat/timer rules, and FastAPI POST /lead/{id}/action. Use when building or changing calling/conversion UI, Zustand call queues, lead status flows, outcome modals, dialer integration, heat score, follow-up scheduling, or when the user mentions call-to-close, CTCS, sequential calling, or instant lead updates without save buttons.
---

# Call-to-close system (CTCS)

## North star

Prioritize **action over display**. The user never decides “what next?” — the system shows it. **No save buttons**: every meaningful tap persists immediately and updates UI optimistically.

## Mental model

`Call → Outcome → Auto update → Next lead`

Repeat. Avoid dashboards, dense tables, and multi-step forms for core work.

## Frontend (React + Zustand)

### Lead Card (required unit)

Every lead renders as a **Lead Card** with:

- Name, phone, city  
- **Call** and **WhatsApp** (primary actions, large tap targets)  
- **Status as one-click buttons** (never a `<select>` for core status)  
- **Timer** from `last_action_at` (warn/red styling after 24h)  
- **Heat score** (visible, updates immediately after actions)  
- **Follow-up CTA** (single obvious next step)

### Status buttons (fixed set)

`[ New ] [ Contacted ] [ Interested ] [ Call Later ] [ Paid ] [ Not Interested ]`

On click:

1. Update client state immediately (optimistic).  
2. `POST` backend action (see below).  
3. Reconcile on response; rollback only on hard failure with a clear toast.

### Call Mode

- Sequential queue of leads.  
- After **any** terminalizing outcome or status that advances the queue, **auto-focus / scroll to the next** Lead Card.  
- Keep “current” lead in Zustand; derive list position from server order + local pending state if needed.

### Call flow

1. User taps **Call** → open device dialer / `tel:` (or app dialer bridge).  
2. **Immediately** show **Outcome modal** (do not wait for call end telemetry unless product explicitly adds it).

**Outcome options** (modal):

- Not Picked  
- Interested  
- Call Later  
- Not Interested  
- Paid  

3. On choice: map to backend action, fire API, run automation hooks, then **advance Call Mode** to next lead.

### UI principles

Mobile-first, large buttons, minimal copy, zero nested navigation for the core loop. Prefer skeletons over spinners that block the whole screen.

## Backend (FastAPI)

### Lead model (minimum fields)

- `id`, `name`, `phone`, `status`  
- `stage_day`  
- `last_action_at`  
- `next_followup_at`  
- `heat_score`  
- `payment_status`

### Endpoint

`POST /lead/{id}/action`

**Actions** (names are canonical for this skill; implement as enum + validation):

| Action / outcome | Behavior |
|------------------|----------|
| `not_picked` | Schedule follow-up **+2h** from now (`next_followup_at`) |
| `interested` | Trigger WhatsApp automation (e.g. send video template); bump heat |
| `call_later` | Schedule follow-up at chosen/derived time |
| `not_interested` | Archive / closed-lost equivalent |
| `paid` | Move to **Day 1** (`stage_day = 1` or pipeline stage per product) |

Always set `last_action_at` on successful mutation.

## Automation rules

### Heat score

- `+20` interested  
- `+10` contacted  
- `-5` not picked  
- **Decay** every 24h (batch job or compute-on-read with stored `last_action_at` / `heat_updated_at` — pick one approach and stay consistent)

Clamp to sensible min/max if product requires it.

### Timer

Derived from `last_action_at`. Visual urgency after **24h** (red / prominent).

### WhatsApp

Auto-trigger on **interested** (server-side or trusted worker; never block the UI thread).

## When editing code in this repo (Myle VL2)

If user-visible lead status strings or semantics are governed by legacy parity (`LEAD_STATUS_OPTIONS`, `app/core/lead_status.py`, `docs/LEGACY_PARITY_MAPPING.md`), **keep CTCS buttons** but implement an **adapter/mapping layer** so API + DB stay canonical to the project — do not silently invent new shipped statuses without documenting in the parity matrix.

## Expected agent behavior on every change

- Enforce this workflow in touched surfaces.  
- Remove extra steps, dropdowns, and “Save” for the call loop.  
- Prefer optimistic updates + single obvious CTAs.  
- Do not build complex dashboards for this flow; build **action-driven** screens.
