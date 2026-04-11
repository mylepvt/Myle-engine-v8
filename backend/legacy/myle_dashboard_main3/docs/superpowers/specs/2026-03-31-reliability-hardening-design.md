# MYLE Reliability Hardening Design

Date: 2026-03-31  
Status: Approved for planning  
Owner: Product + Engineering

## Goal

Make the app reliable and trusted for team, leader, and admin with these outcomes:

1. Zero data mismatch
2. Zero workflow blockers
3. Zero silent failures
4. Fast, smooth UX

### KPI Definitions (Operational)

| KPI | Definition | Source | Target | Window | Owner |
|---|---|---|---|---|---|
| `critical_invariant_breach_rate` | blocked critical writes / critical write attempts | structured reliability events | `0` | per deploy + 24h | backend |
| `unknown_5xx_rate` | 5xx responses without incident code / total requests | app logs + route metrics | `< 0.1%` | rolling 24h | backend |
| `workflow_block_rate` | blocked user critical actions / total critical actions | route events | `< 0.5%` (excluding auth/permission) | rolling 24h | product+backend |
| `kpi_mismatch_count` | dashboard KPI mismatch against SQL source-of-truth checks | reconciliation job | `0` | daily | data owner |
| `p95_claim_latency_ms` | p95 latency of claim flow | route timing logs | `< 600ms` | rolling 1h | backend |
| `p95_approval_latency_ms` | p95 latency of ₹196 approve/reject | route timing logs | `< 500ms` | rolling 1h | backend |

## Rollout Strategy

Chosen strategy: phased hardening.

- Phase 1: remove silent failures and improve observability
- Phase 2: enforce data contracts and mismatch prevention
- Phase 3: workflow and UX smoothing

Failure mode policy: hybrid.

- Critical paths: strict stop (block write)
- Non-critical paths: auto-repair + continue + alert

## Assumptions and Constraints

- DB engine: SQLite with WAL enabled; trigger/check support must remain available.
- Request correlation: every request must carry or generate `request_id`.
- Logs: reliability events retained minimum 14 days for incident tracing.
- Feature flags are available through `app_settings`.
- Migrations run during controlled startup and may briefly elevate lock contention.
- Auto-repair is allowed only for non-authoritative/derived data, never for critical ownership transitions.

## Architecture

### Reliability Kernel

Central reliability layer for:

- invariant checks
- failure policy decisions
- structured event logging
- user-safe error mapping

### Workflow Guardrail

All critical transitions pass through one validation layer:

- lead claim
- status transition
- payment proof review
- owner/handoff updates

### Data Contract Layer

- migration cleanup for legacy inconsistencies
- startup invariant scans
- DB-level protection (constraints/triggers/checks)

### Observability Layer

Each critical action emits structured logs:

- request_id
- user_id
- lead_id
- action
- outcome
- incident_code (if blocked)

## Components

### `reliability.py` (shared module)

Planned functions:

- `assert_invariants(...)`
- `fail_policy(...)`
- `emit_event(...)`
- `safe_user_error(...)`

### Route Integration

- `routes/wallet_routes.py`: atomic claim, idempotent duplicate-action handling
- `routes/lead_routes.py`: status/proof transitions enforced via invariant checks
- `routes/report_routes.py`: robust canonical action parsing for approvals

### `database.py` hardening blocks

- startup invariant scan with critical counters
- one-time cleanup migrations for invalid owner/handoff states
- DB guards for impossible states

## Critical vs Non-critical Decision Table

| Flow / Route | Invariant Set | Enforcement | Incident Family | User Message Type | Owner |
|---|---|---|---|---|---|
| `/lead-pool/claim` | claimable lead must be `in_pool=1` and owner null pre-claim; owner mandatory post-claim | strict-stop | `REL-CLM-*` | blocking error | backend |
| `/leads/<id>/payment-proof-review` | valid action + reviewer permission + proof exists + post-update invariant | strict-stop | `REL-APR-*` | blocking error | backend |
| status transition routes | legal forward transition + role ownership + gate condition + owner invariant | strict-stop | `REL-STS-*` | blocking error | backend |
| dashboard KPI queries | source-of-truth aggregation consistency | auto-repair/reconcile | `REL-KPI-*` | warning/non-blocking | backend+ops |
| denormalized display fields | non-authoritative text/labels consistency | auto-repair | `REL-DIS-*` | none or warning | backend |

### Ops Watch endpoint

Admin-facing reliability counters:

- mismatch count
- blocked critical writes
- retry spikes
- stuck transition counts

Health verdict:

- healthy
- warning
- critical

### UI Reliability layer

- in-flight button lock / debounce
- canonical redirect behavior via trusted `next`
- deterministic toast mapping for success/warn/block

## Data Flow and Failure Policy

### Critical paths (strict stop)

If invariant breaks:

- rollback
- block write
- return incident code
- log CRITICAL

Flows:

- claim
- payment proof approve/reject
- stage boundary transitions
- owner/handoff writes

### Non-critical paths (auto-repair)

If mismatch detected:

- repair immediately or via safe repair path
- continue response
- log warning with repair details

Areas:

- derived counters
- legacy nullable non-authoritative fields
- denormalized display labels

### Canonical flow examples

Claim:

1. Select candidate leads with strict claimable filter.
2. Atomic update with same claimable predicate.
3. Check rowcount.
4. Assert post-update invariants.
5. Commit and emit success event.

Proof review:

1. Normalize action payload.
2. Validate permission and proof presence.
3. Apply review update.
4. Assert invariants.
5. Commit and redirect back to source queue.

Stage transition:

1. Validate transition and role ownership.
2. Apply update through guardrail.
3. Assert invariants.
4. Commit.

## Testing Gates

Mandatory pre-release checks:

| Scenario | Setup | Steps | Expected Result | Automation | Release Gate |
|---|---|---|---|---|---|
| Forced DB failure | mock `get_db()` failure / lock DB | hit critical routes | controlled failure, incident code, no redirect loop | integration test | must pass |
| Duplicate submit spam | same session/token | submit same critical action 3x rapidly | max 1 effective write | integration test | must pass |
| Concurrent claim race | N parallel claim requests for same lead set | run race with thread/process workers | no double-claim; invariant preserved | integration test | must pass |
| Slow network overlap | inject 2s delay in critical transition path | overlap second request during delay | no inconsistent state; deterministic response | integration test | must pass |
| Role permission matrix | team/leader/admin fixtures | attempt approve/reject and restricted transitions | only allowed roles succeed | integration test | must pass |
| KPI reconciliation | seeded dataset | compare dashboard counters vs SQL baseline queries | exact match on critical KPIs | nightly + pre-release | must pass |

Go rules:

- zero critical invariant breaches
- zero unknown 5xx without incident code
- critical flows pass race/duplicate tests

No-go rules:

- any off-pool owner-null row remains
- approval action ambiguity returns
- critical KPI mismatch monitor non-zero

## Phase Plan

### Phase 1: Silent Failure Elimination

- incident code framework
- structured logs on critical flows
- controlled failure responses
- admin reliability watch baseline
- feature flags introduced (default OFF), then enabled per canary cohort

### Phase 2: Data Mismatch Elimination

- strict owner/claim/handoff contracts
- cleanup migrations for legacy bad rows
- startup invariant checks with fail-fast on critical violations
- migration canary on low-traffic window before full rollout

### Phase 3: Workflow + UX Smoothness

- stable redirect contracts
- in-flight action guard on UI
- response-time and queue interaction polish
- user feedback clarity updates

## Rollout and Rollback Playbook

### Canary Strategy

- Start with 10% internal/admin-led traffic for each phase.
- Promote to 50% after 24h stable KPIs.
- Move to 100% only when all phase gates are green.

### Feature Flags

- `rel_phase1_controlled_failure`
- `rel_phase2_data_contract_enforcement`
- `rel_phase3_ui_reliability`

Default state: OFF. Enable sequentially per phase.

### Promotion Criteria (per phase)

- no critical invariant breaches in canary window
- unknown 5xx under threshold
- target p95 latency met for phase-owned flows
- no KPI mismatch regressions

### Rollback Procedure

1. Disable current phase flag immediately.
2. Re-run invariant scan and reconciliation snapshot.
3. If data mutation risk detected, hold writes on affected route group.
4. Publish incident summary with incident code family and impacted routes.

Rollback SLO: initial mitigation within 15 minutes.

## Post-release Monitoring

- first 24h: hourly reliability check
- next 7 days: daily mismatch and blocker report
- rollback trigger: repeated critical invariant violations in same flow

## Out of Scope (for this spec)

- large feature additions unrelated to reliability
- major UI redesign outside workflow smoothness needs
- infrastructure replacement/migration beyond current stack
