# 04 — Lead Pipeline Constants (Rule Engine)

> Source: `services/rule_engine.py` (canonical), re-exported via `helpers.py`.
> **Import from `rule_engine`, never hard-code these strings.**

## 1. Canonical Status Flow (FSM)

```python
STATUS_FLOW_ORDER = [
    'New Lead',
    'Contacted',
    'Invited',
    'Video Sent',
    'Video Watched',
    'Paid ₹196',
    'Day 1',
    'Day 2',
    'Interview',
    'Track Selected',
    'Seat Hold Confirmed',
    'Fully Converted',
]
```

Legacy aliases normalized by `normalize_flow_status`:
- `'New'`        → `'New Lead'`
- `'Converted'`  → `'Fully Converted'`

Statuses **outside** this list but allowed by the system:
`Lost`, `Retarget`, `Inactive`, `Converted`, `Training`, `Pending`, `Level Up`, `2cc Plan`.

## 2. Status ↔ Pipeline Stage Map

```python
STATUS_TO_STAGE = {
    'New Lead':            'prospecting',
    'New':                 'prospecting',
    'Contacted':           'prospecting',
    'Invited':             'prospecting',
    'Video Sent':          'prospecting',
    'Video Watched':       'prospecting',
    'Paid ₹196':           'enrolled',
    'Day 1':               'day1',
    'Day 2':               'day2',
    'Interview':           'day3',
    '2cc Plan':            'plan_2cc',
    'Track Selected':      'day3',
    'Seat Hold Confirmed': 'seat_hold',
    'Pending':             'pending',
    'Level Up':            'level_up',
    'Fully Converted':     'closing',
    'Training':            'training',
    'Converted':           'complete',
    'Lost':                'lost',
    'Retarget':            'prospecting',
    'Inactive':            'inactive',
}
```

**Rule:** whenever `leads.status` is updated, recompute `leads.pipeline_stage = STATUS_TO_STAGE[new_status]` in the same UPDATE. Never let them drift.

## 3. Reverse Map

```python
STAGE_TO_DEFAULT_STATUS = {
    'enrollment': 'New Lead',
    'day1':       'Day 1',
    'day2':       'Day 2',
    'day3':       'Interview',
    'seat_hold':  'Seat Hold Confirmed',
    'closing':    'Fully Converted',
    'training':   'Training',
    'complete':   'Converted',
    'lost':       'Lost',
}
```
Used when stage is advanced programmatically (e.g., Payment Done → Day 1 auto-transition).

## 4. Auto-Expire Whitelist

Leads in these stages auto-flip to `status='Inactive'` after **24 hrs** of no status change:
```python
PIPELINE_AUTO_EXPIRE_STATUSES = [
    'Day 1', 'Day 2', 'Interview', '2cc Plan', 'Track Selected',
    'Seat Hold Confirmed', 'Level Up',
]
```
**Not** in the list: `New Lead → Paid ₹196` (team needs unlimited time to nurture).

## 5. SLA Watch (Soft)

Every status **except** these is on the soft-SLA watch (Red/Yellow anchors in UI):
```python
SLA_SOFT_WATCH_EXCLUDE = ('Lost', 'Retarget', 'Inactive', 'Converted')
```
Anchor time = `updated_at` → `claimed_at` → `created_at` (first non-empty).

## 6. Role-Based Status Permissions

```python
TEAM_FORBIDDEN_STATUSES = frozenset([
    'Day 1', 'Day 2', 'Interview', 'Track Selected',
    'Seat Hold Confirmed', 'Fully Converted', 'Level Up',
    'Training', 'Converted', 'Pending', '2cc Plan',
])

TEAM_ALLOWED_STATUSES = (
    'New Lead', 'Contacted', 'Invited',
    'Video Sent', 'Video Watched',
    'Paid ₹196',
    'Lost', 'Retarget',
)
```

- Team dropdown shows only `TEAM_ALLOWED_STATUSES`.
- API-level guard: if `role=='team'` and `new_status in TEAM_FORBIDDEN_STATUSES` → 403.
- Leader/admin have no status restriction (aside from the FSM function below).

## 7. FSM Transition Validator

```python
def is_valid_forward_status_transition(
    current_status: str,
    target_status: str,
    *,
    for_team: bool = False
) -> bool:
    """
    - Backward / same / statuses outside STATUS_FLOW_ORDER: ALLOWED (legacy + admin fixes).
    - Default (leader/admin): exactly +1 step forward.
    - Team: any forward jump BEFORE 'Paid ₹196';
      'Paid ₹196' only from 'Video Watched' or already 'Paid ₹196'.
      No forward movement AT or AFTER 'Paid ₹196' (leader takes over).
    """
    cur = normalize_flow_status(current_status)
    tgt = normalize_flow_status(target_status)
    if not tgt or cur == tgt:
        return True
    flow_idx = {s: i for i, s in enumerate(STATUS_FLOW_ORDER)}
    if cur not in flow_idx or tgt not in flow_idx:
        return True                     # off-flow, allow
    if flow_idx[tgt] <= flow_idx[cur]:
        return True                     # backward/same, allow
    if for_team:
        paid_i = flow_idx['Paid ₹196']
        if tgt == 'Paid ₹196':
            return cur in ('Video Watched', 'Paid ₹196')
        if flow_idx[tgt] < paid_i:
            return flow_idx[tgt] > flow_idx[cur]
        return False
    # leader/admin: exactly next step
    return flow_idx[tgt] == flow_idx[cur] + 1
```

Leader/admin can bypass the +1 rule by going **backward** (admin corrections) or to an off-flow status (`Lost`, `Retarget`, `Inactive`).

## 8. Call Status Values

Full list (admin/leader sees everything):
```python
CALL_STATUS_VALUES = [
    'Not Called Yet',
    'Called - No Answer',
    'Called - Interested',
    'Called - Not Interested',
    'Called - Follow Up',
    'Called - Switch Off',
    'Called - Busy',
    'Call Back',
    'Wrong Number',
    'Video Sent',
    'Video Watched',
    'Payment Done',
    'Already forever',
    'Retarget',
]
```

Team dropdown (dial outcomes only — pipeline progress is via Lead Status field):
```python
TEAM_CALL_STATUS_VALUES = [
    'Not Called Yet',
    'Called - No Answer',
    'Called - Interested',
    'Called - Not Interested',
    'Called - Follow Up',
    'Called - Switch Off',
    'Called - Busy',
    'Call Back',
    'Wrong Number',
]
```

## 9. Call-Status Buckets (Discipline Engine)

Used by `apply_call_outcome_discipline` (see file 19):

```python
CALL_STATUS_NOT_INTERESTED_BUCKET = frozenset({'Called - Not Interested'})

CALL_STATUS_NO_RESPONSE_BUCKET = frozenset({
    'Called - No Answer',
    'Called - Switch Off',
    'Called - Busy',
})

CALL_STATUS_INTERESTED_BUCKET = frozenset({
    'Called - Interested',
    'Called - Follow Up',
    'Call Back',
    'Video Sent',
    'Video Watched',
    'Payment Done',
})
```

**Rules triggered when a call outcome is saved:**
- `NOT_INTERESTED` bucket → status auto-moves to `Lost`.
- `NO_RESPONSE` bucket → increment `no_response_attempt_count`; on 3rd strike auto-move to `Retarget`.
- `INTERESTED` bucket → `follow_up_date = tomorrow`, `follow_up_time = '10:00'`; reset `no_response_attempt_count = 0`.

## 10. Claim Gate Exit Statuses

Leads whose status ∈ these can NOT be claimed from the pool (they are closed):
```python
CLAIM_GATE_EXIT_STATUSES = ('Lost', 'Retarget', 'Converted', 'Fully Converted')
```

## 11. Track Pricing

```python
TRACKS = {
    'Slow Track':   {'price':  8000, 'seat_hold': 2000},
    'Medium Track': {'price': 18000, 'seat_hold': 4000},
    'Fast Track':   {'price': 38000, 'seat_hold': 5000},
}
```

## 12. Business-rule hard validation

```python
def validate_lead_business_rules(
    status, payment_done, payment_amount, seat_hold_amount, track_price
) -> tuple[bool, str]:
    if payment_done == 1 and payment_amount <= 0:
        return False, 'payment_done=1 requires payment_amount > 0'
    if status == 'Seat Hold Confirmed' and seat_hold_amount <= 0:
        return False, 'Seat Hold Confirmed requires seat_hold_amount > 0'
    if status == 'Fully Converted' and track_price <= 0:
        return False, 'Fully Converted requires track_price > 0'
    return True, ''
```

Run this **before every write** that touches `status`, `payment_*`, `seat_hold_amount`, or `track_price`.

## 13. Source List

```python
SOURCES = [
    'Instagram', 'Facebook', 'WhatsApp', 'Personal Referral',
    'Walk-in', 'Call-in', 'Other',
]
```

## 14. Other Constants (helpers.py)

- `PAYMENT_AMOUNT = 196` — the enrollment fee
- `INACTIVITY_BLOCK_CLAIM_HOURS = 48`
- `INACTIVITY_LOCK_HOURS = 72`
- `INACTIVITY_WARN_HOURS = 24`
- `DAILY_CALL_ENFORCE_START_HOUR_IST = 11` — daily target enforcement starts at 11:00 IST

## Acceptance Checklist

- [ ] Every constant above lives in a single module; no other file hard-codes these strings
- [ ] `STATUS_TO_STAGE` covers every value that can appear in `leads.status`
- [ ] Updating `leads.status` always updates `leads.pipeline_stage` in the same transaction
- [ ] Team API rejects any status ∈ `TEAM_FORBIDDEN_STATUSES` with 403
- [ ] `is_valid_forward_status_transition(..., for_team=True)` correctly allows Video Watched → Paid ₹196 but blocks Contacted → Day 1
- [ ] `validate_lead_business_rules` runs before every lead UPDATE/INSERT
- [ ] `TRACKS` pricing matches the old app's customer-visible rates (₹8k/₹18k/₹38k)
- [ ] Pool claim rejects leads whose status ∈ `CLAIM_GATE_EXIT_STATUSES`
- [ ] `PIPELINE_AUTO_EXPIRE_STATUSES` excludes prospecting statuses so New Lead never auto-expires
