# Legacy ↔ Myle vl2 — parity mapping (no guesswork)

This document is the **only** place where we claim **“matches legacy app”** for a feature.  
**Rule:** Do **not** invent legacy behavior from this repo. The **Legacy** columns stay **empty or TBD** until someone attaches **evidence** (see below).

## How parity is verified

| Column | Meaning |
|--------|---------|
| **Legacy ref** | Stable id in the old product: screen name + path or menu label **as in legacy**, plus **evidence** (one or more). |
| **Evidence (required for “match” claims)** | At least one of: link to legacy repo path + tag; exported spec / Notion / sheet row id; screenshot set with date; API contract from legacy; product owner sign-off with date. |
| **New app path** | `frontend` URL under **`/dashboard/...`** — from **`frontend/src/config/dashboard-registry.ts`** (`DASHBOARD_ROUTE_DEFS`). |
| **New wiring** | `surface`: **`full`** (real UI component in `DashboardNestedPage`) vs **`stub`** (`ShellStubPage` → `stubApiPath`) vs **`dashboard-home`**. |
| **Backend (new)** | Authoritative behavior — file or router (see inventory). |

If **Legacy ref** or **Evidence** is missing, status = **TBD — not parity-claimed**.

### Automated regression (new app — not a legacy “match” claim)

| Check | What it proves |
|--------|----------------|
| `tests/` (pytest) | API behavior vs FastAPI routes (auth, leads, wallet, team, …). |
| `frontend` Vitest (`src/**/*.test.tsx`) | UI units: login shell, protected route, **dashboard registry** titles/surfaces, **`apiUrl` + `VITE_API_URL`**. |
| Playwright `frontend/e2e/` | **Smoke:** `/login` renders. **Happy path (mocked `fetch`):** dev login → dashboard → **All Leads** → change lead stage. **Axe:** login route structural a11y (see `a11y.spec.ts` — `color-contrast` excluded until palette hits WCAG AA). |
| CI | Same as above + `npm audit` + `pip-audit` (Python 3.10+). |

Prod validation (real devices, throttling, WebSocket load) is still manual / staging — not encoded here.

---

## Cross-cutting behavior (new app — factual, code pointers)

These apply everywhere; legacy comparison rows belong in the **matrix** only after evidence.

| Topic | New app behavior | Source |
|--------|------------------|--------|
| Lead visibility | `admin`: all; `leader`: self + downline (`upline_user_id` tree); `team`: own created | `backend/app/services/lead_scope.py` |
| Workboard buckets | Same visibility as `GET /leads`, grouped by `status`, capped | `backend/app/api/v1/workboard.py` |
| Dashboard routes & roles | Single registry + JSON roles | `frontend/src/config/dashboard-registry.ts`, `frontend/src/config/dashboard-route-roles.json` |
| Feature flag (Intelligence nav) | `GET /api/v1/meta` → `features.intelligence` | `backend` meta router + `frontend` `useMetaQuery` |

---

## New app — full route inventory (factual)

Base URL prefix: **`/dashboard/`** + path below.  
Roles: **`frontend/src/config/dashboard-route-roles.json`** (exact list per path).

| Path | `surface` | Renders / API |
|------|------------|----------------|
| *(home)* | `dashboard-home` | `DashboardHomePage` |
| `work/leads` | full | `LeadsWorkPage` (active) |
| `work/workboard` | full | `WorkboardPage` |
| `work/follow-ups` | full | `FollowUpsWorkPage` |
| `work/retarget` | full | `RetargetWorkPage` |
| `work/lead-flow` | full | `LeadFlowPage` |
| `work/archived` | full | `LeadsWorkPage` (archived) |
| `work/add-lead` | full | `LeadsWorkPage` (active) |
| `work/lead-pool` | full | `LeadPoolWorkPage` |
| `work/lead-pool-admin` | full | `LeadPoolWorkPage` |
| `work/recycle-bin` | full | `RecycleBinWorkPage` |
| `intelligence` | full | `IntelligenceWorkPage` (gated by `features.intelligence`) |
| `team/members` | full | `TeamMembersPage` |
| `team/reports` | full | `TeamReportsPage` + `GET /api/v1/team/reports` (live metrics) |
| `team/approvals` | full | `TeamApprovalsPage` — `GET /api/v1/team/pending-registrations` + `POST /api/v1/team/pending-registrations/{id}/decision` (approve/reject). Shell parity: `GET /api/v1/team/approvals` still returns short links JSON |
| `team/enrollment-approvals` | full | `EnrollmentApprovalsPage` |
| `team/my-team` | full | `MyTeamPage` |
| `system/training` | full | `SystemSurfacePage` (training) |
| `system/decision-engine` | full | `SystemSurfacePage` (decision-engine) |
| `system/coaching` | full | `SystemSurfacePage` (coaching) |
| `analytics/activity-log` | full | `AnalyticsSurfacePage` (activity-log) — nav **System** |
| `analytics/day-2-report` | full | `AnalyticsSurfacePage` (day-2-report) — nav **System** |
| `finance/recharges` | full | `FinanceRechargesPage` |
| `finance/wallet` | full | `WalletPage` |
| `finance/recharge-request` | full | `WalletRechargePage` |
| `finance/recharge-admin` | full | `WalletRechargeAdminPage` |
| `other/leaderboard` | stub | `GET /api/v1/other/leaderboard` |
| `other/notice-board` | full | `NoticeBoardPage` + `GET/POST/DELETE` `/api/v1/other/notice-board` |
| `other/live-session` | stub | `GET /api/v1/other/live-session` |
| `other/daily-report` | full | `DailyReportFormPage` + `GET /api/v1/other/daily-report` |
| `settings/app` | stub | `GET /api/v1/settings/app` |
| `settings/help` | stub | `GET /api/v1/settings/help` |
| `settings/org-tree` | stub | `GET /api/v1/settings/org-tree` |

**Stub map derivation:** `SHELL_STUB_API_PATHS` in `dashboard-registry.ts` — do not duplicate.

**Backend-only (no `/dashboard/` route):** `GET /api/v1/execution/*`, `GET /api/v1/finance/budget-export`, `GET /api/v1/finance/monthly-targets`, `GET /api/v1/finance/lead-pool`, `GET /api/v1/other/training`, `GET /api/v1/settings/all-members` — see **`docs/CORE_APP_STRUCTURE.md`**.

---

## Phase 0.1 — Legacy navigation export (paste here)

**Filled 2026-04-12 (repo-derived):** Sidebar **labels** and **role gating** from **`backend/legacy/myle_dashboard_main3/templates/base.html`**. **URL paths** from **`backend/legacy/myle_dashboard_main3/routes/*.py`** (`@app.route`) where registered there; for **`/dashboard`**, **`/working`**, **`/admin`**, **`/admin/*`** execution/settings/analytics/members paths, and **`/my/lead-flow`**, from **`backend/legacy/myle_dashboard/app.py`** (monolithic app — same Flask `url_for` names as `base.html`; **re-verify on deployed host** if your fork differs).

| Section (legacy) | Menu label (legacy) | URL path (legacy) | Roles (legacy) | Notes |
|------------------|----------------------|-------------------|----------------|-------|
| *(top)* | Dashboard | `/admin` | admin | `url_for('admin_dashboard')` |
| *(top)* | Dashboard | `/dashboard` | team, leader | `url_for('team_dashboard')` — shared home for non-admin |
| Execution | At-risk leads | `/admin/at-risk-leads` | admin | |
| Execution | Weak members | `/admin/weak-members` | admin | |
| Execution | Leak map | `/admin/leak-map` | admin | |
| Execution | Lead ledger | `/admin/lead-ledger` | admin | |
| Work | All Leads | `/leads` | admin | Nav text: “All Leads” |
| Work | My Leads | `/leads` | team, leader | Same path; nav text: “My Leads” |
| Work | Workboard | `/working` | team, leader, admin | |
| Work | Follow-ups | `/follow-up` | leader, admin | Hidden for `role == 'team'` in sidebar |
| Work | Retarget | `/retarget` | team, leader, admin | |
| Work | Lead Flow | `/my/lead-flow` | team, leader | |
| Work | Archived Leads | `/old-leads` | team, leader, admin | |
| Work | Add Lead | `/leads/add` | admin | |
| Work | Lead Pool | `/admin/lead-pool` | admin | |
| Work | Recycle Bin | `/leads/recycle-bin` | admin | |
| Work | AI Intelligence | `/intelligence` | team, admin | Sidebar: `role != 'leader'` and `myle_ai_features_enabled`; vl2 nav uses **Intelligence** + `meta.features.intelligence` |
| Team | Members | `/team` | admin | |
| Team | Reports | `/reports` | admin | `reports_admin` — daily reports admin view |
| Team | Approvals | `/admin/approvals` | admin | |
| Team | ₹196 Approvals | `/enrollment-approvals` | admin, leader | |
| Team | My Team | `/leader/team-reports` | leader | |
| System | Training | `/admin/training` | admin | |
| System | Decision Engine | `/admin/decision-engine` | admin | |
| System | Coaching Panel | `/leader/coaching` | admin, leader | |
| Analytics | Activity Log | `/admin/activity` | admin | |
| Analytics | Day 2 Test Report | `/admin/day2-business-test-report` | admin | |
| Finance | Recharges | `/admin/wallet-requests` | admin | |
| Finance | Budget Export | `/admin/budget-export` | admin | |
| Finance | Monthly Targets | `/admin/targets` | admin | |
| Finance | My Wallet | `/wallet` | team, leader | |
| Finance | Lead Pool | `/lead-pool` | team, leader | Non-admin pool browse/claim |
| Other | Leaderboard | `/leaderboard` | team, leader, admin | |
| Other | Notice Board | `/announcements` | team, leader, admin | |
| Other | Live Session | `/live-session` | team, leader | |
| Other | Live Session | `/admin/live-session` | admin | Admin edit UI for zoom/settings |
| Other | Training *(nav)* | `/training` | team, leader | Badge variants: Done / Required — see template |
| Other | Daily Report | `/reports/submit` | team, leader | |
| Settings | Settings | `/admin/settings` | admin | |
| Settings | Help | `/help` | admin | |
| Settings | All Members | `/admin/members` | admin | |
| Settings | Org Tree | `/admin/org-tree` | admin | |

*Export id (for matrix Evidence column):* `NAV-EXPORT-001` — matrix rows mein Evidence: **`NAV-EXPORT-001`** + (optional) screenshot from live legacy host.

---

## Parity matrix (legacy ↔ new) — fill with evidence

**Starter rows (2026-04-12):** **Legacy ref** copied from Phase 0.1; behavior **TBD** until manual/API evidence.

| Legacy ref (id + menu/path) | Evidence | New path | New wiring | Parity status | Owner / date |
|-----------------------------|----------|----------|------------|---------------|--------------|
| My Leads / All Leads — `/leads` | `NAV-EXPORT-001`; `EVID-2026-001` | `work/leads` | full | TBD | |
| Workboard — `/working` | `NAV-EXPORT-001`; `EVID-2026-002` | `work/workboard` | full | TBD | |
| Follow-ups — `/follow-up` | `NAV-EXPORT-001`; `EVID-2026-003` | `work/follow-ups` | full | TBD | |
| Archived Leads — `/old-leads` | `NAV-EXPORT-001`; `EVID-2026-004` | `work/archived` | full | TBD | |
| Lead Pool — `/lead-pool` or `/admin/lead-pool` | `NAV-EXPORT-001`; `EVID-2026-005` | `work/lead-pool` / `work/lead-pool-admin` | full | TBD | |
| Recycle Bin — `/leads/recycle-bin` | `NAV-EXPORT-001`; `EVID-2026-006` | `work/recycle-bin` | full | TBD | |

**Evidence ids:** Repo-local reference slots — jab file/Notion/screenshot attach ho, yahi id matrix aur evidence store mein use karo. **“match”** sirf jab dono legacy + new documented hon.

**Parity status values:** `TBD` | `partial` | `match` | `won’t match (reason)` — only with evidence for legacy + new.

---

## Backend v1 routers (new app — for wiring checks)

Aggregate: `backend/app/api/v1/router.py`. Domains include: `meta`, `auth`, `leads`, `team`, `system`, `analytics`, `execution`, `finance`, `other`, `settings`, `wallet`, `lead-pool`, `retarget`, `follow-ups`, `workboard`, `gate-assistant`, `realtime_ws` (WebSocket).

When mapping a legacy feature, point the **new** row to the concrete router module under `backend/app/api/v1/` if HTTP behavior is in scope.

---

## Maintenance

- When adding a dashboard screen: update **`DASHBOARD_ROUTE_DEFS`** first, then add or adjust a row in the **inventory** table above.
- When legacy parity is agreed: fill **Parity matrix** — never claim parity in chat or PR description without updating this file.
- **Implementation order (waves, stub→full checklist):** **`docs/PARITY_ROLLOUT_PLAN.md`**.
- **Full behavior port (backend + frontend, lossless rules):** **`docs/LOSSLESS_FULLSTACK_PORT.md`**.
