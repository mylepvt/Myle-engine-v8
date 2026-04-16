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
| Lead visibility | **vl2 `GET /leads` list:** `admin` all; `leader` self + downline-created (`lead_visible_to_leader_clause`); `team` **only `created_by_user_id=self`** (`lead_visibility_where`). **Legacy `/leads` (Flask):** `team` rows match **assignee / stale_worker** (and `current_owner` post-filter), not creator-only — see `backend/legacy/myle_dashboard_main3/routes/lead_routes.py` (`_leads_inner`). **Gap:** team “My Leads” list scope differs until explicitly ported + matrix row updated. Regression: `tests/test_api_v1_leads.py` (`test_slice1_*`). | `lead_scope.py`, `leads_validator.lead_list_conditions`, legacy `lead_routes.py` |
| Workboard buckets | Same visibility as `GET /leads`, grouped by `status`, capped | `backend/app/api/v1/workboard.py` |
| Dashboard routes & roles | Single registry + JSON roles | `frontend/src/config/dashboard-registry.ts`, `frontend/src/config/dashboard-route-roles.json` |
| Feature flag (Intelligence nav) | `GET /api/v1/meta` → `features.intelligence` | `backend` meta router + `frontend` `useMetaQuery` |
| Call-to-close (CTCS) | `POST /api/v1/leads/{id}/action` maps outcomes to canonical `Lead.status` via `advance_lead_status_toward` (legacy FSM); `ctcs_heat` + status chain apply +10 on first `contacted`; optional `followup_at` on `call_later`; WhatsApp/webhook via `whatsapp_ctcs.py`, queued after HTTP when `CTCS_WHATSAPP_ASYNC=true`. UI: optimistic patch `frontend/src/lib/ctcs-optimistic.ts`. Regression: `tests/test_api_v1_ctcs.py`. | `backend/app/services/leads_service.py`, `ctcs_status_chain.py`, `ctcs_heat.py`, `whatsapp_ctcs.py`; `frontend/src/components/leads/CtcsWorkSurface.tsx` |
| Team dashboard home (legacy `/dashboard`) | **Team** role: enrollment funnel strip from `GET /api/v1/execution/personal-funnel` (same service idea as legacy `team_personal_funnel`); no `GET /follow-ups` prefetch (legacy had empty follow-ups list for team); **Live session** KPI card links to `other/live-session` (legacy `zoom_*` settings block). **Not yet 1:1:** legacy “today claimed / calls / enrolled” micro-stats + wallet block layout still differ. | `frontend/src/pages/DashboardHomePage.tsx`, `frontend/src/hooks/use-team-personal-funnel-query.ts`, `backend/app/services/execution_enforcement.py` |

---

## New app — full route inventory (factual)

Base URL prefix: **`/dashboard/`** + path below.  
Roles: **`frontend/src/config/dashboard-route-roles.json`** (exact list per path).

| Path | `surface` | Renders / API |
|------|------------|----------------|
| *(home)* | `dashboard-home` | `DashboardHomePage` |
| `work/leads` | full | `LeadsWorkPage` (active) — **Call-to-close** cards + tabs + `GET/POST` CTCS APIs; optional **Advanced** classic table |
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
| `finance/budget-export` | full | `BudgetExportPage` + `GET /api/v1/finance/budget-export` (per-member wallet rows; legacy ``/admin/budget-export`` intent — pool spend/date CSV still differs) |
| `other/leaderboard` | full | `LeaderboardPage` + `GET /api/v1/other/leaderboard` |
| `other/notice-board` | full | `NoticeBoardPage` + `GET/POST/DELETE` `/api/v1/other/notice-board` |
| `other/training` | full | `CommunityTrainingPage` + `GET /api/v1/other/training` |
| `other/live-session` | full | `LiveSessionPage` + `GET /api/v1/other/live-session` |
| `other/daily-report` | full | `DailyReportFormPage` + `GET /api/v1/other/daily-report` |
| `settings/app` | full | `SettingsAppPage` + `GET /api/v1/settings/app` |
| `settings/help` | full | `SettingsHelpPage` + `GET /api/v1/settings/help` |
| `settings/all-members` | full | `AllMembersPage` → `TeamMembersPage` + `GET/POST /api/v1/team/members` |
| `settings/org-tree` | full | `SettingsOrgTreePage` + `GET /api/v1/settings/org-tree` |

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
| Work | My Leads | `/leads` | team, leader | Same path; **vl2** team nav label: **Calling Board** (legacy sidebar: “My Leads”) |
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
| My Leads / All Leads — `/leads` | `NAV-EXPORT-001`; `EVID-2026-001` | `work/leads` | full | partial — team menu label **Calling Board** vs legacy “My Leads” (`dashboard-registry.ts`, 2026-04-15) | |
| Workboard — `/working` | `NAV-EXPORT-001`; `EVID-2026-002` | `work/workboard` | full | TBD | |
| Follow-ups — `/follow-up` | `NAV-EXPORT-001`; `EVID-2026-003`; `EVID-2026-SLICE3-001` (`tests/test_api_v1_follow_ups.py::test_slice3_team_forbidden_for_follow_up_queue_api`) | `work/follow-ups` | full | partial — team forbidden (403 API + FE role gating) now matches legacy intent; due-date/overdue queue ordering parity still pending | 2026-04-15 |
| Archived Leads — `/old-leads` | `NAV-EXPORT-001`; `EVID-2026-004`; `EVID-2026-SLICE4-001` (`tests/test_api_v1_leads.py::test_slice4_archived_*`, `test_slice4_deleted_only_*`, `test_slice4_team_*restore*`, `test_slice4_permanent_delete_*`) | `work/archived` | full | partial — archived + recycle list scope now assignee/execution-style for non-admin, restore from recycle allowed for assigned non-admin leads, and admin-only hard delete available (`DELETE /api/v1/leads/{id}/permanent-delete`); remaining parity is mostly UI/wording polish vs legacy template | 2026-04-15 |
| Lead Pool — `/lead-pool` or `/admin/lead-pool` | `NAV-EXPORT-001`; `EVID-2026-005`; `EVID-2026-SLICE5-001` (`tests/test_api_v1_leads.py::test_slice5_*`) | `work/lead-pool` / `work/lead-pool-admin` | full | partial — claim edge guards now locked: admin claim forbidden, insufficient wallet returns 402 without removing pool row, and already-claimed lead cannot be re-claimed; legacy-only cooldown/daily-cap rules still pending | 2026-04-15 |
| Recycle Bin — `/leads/recycle-bin` | `NAV-EXPORT-001`; `EVID-2026-006` | `work/recycle-bin` | full | TBD | |
| Login session persistence (remember me/session restore) | `EVID-2026-007` | `/login` + protected `/dashboard/*` | full | TBD | |
| **Call-to-close (CTCS)** — fast loop + list filters + actions | `NAV-EXPORT-001`; **`EVID-CTCS-2026-001`** — `tests/test_api_v1_ctcs.py`; `backend/app/api/v1/leads.py`, `leads_service.py`, `ctcs_status_chain.py`, `ctcs_heat.py`, `whatsapp_ctcs.py`; `frontend` `LeadsWorkPage.tsx`, `CtcsWorkSurface.tsx`, `CtcsLeadCard.tsx`, `CtcsOutcomeModal.tsx`, `phone-links.ts` (`whatsappDigits` ≡ legacy `wa_phone`), `ctcs-optimistic.ts` | `work/leads` | full | **partial** — action-first vs legacy table-first; card **Phone** = `tel:` (legacy dial) + `POST /call-log` + outcome modal; modal repeats **Dial** + **WhatsApp** like `leads.html` call panel header; `wa.me` digits match `myle_dashboard` `wa_phone_filter`; WhatsApp enrollment assets = env webhook or stub (async when `CTCS_WHATSAPP_ASYNC=true`) | 2026-04-15 |

**Evidence ids:** Repo-local reference slots — jab file/Notion/screenshot attach ho, yahi id matrix aur evidence store mein use karo. **“match”** sirf jab dono legacy + new documented hon.

**Parity status values:** `TBD` | `partial` | `match` | `won’t match (reason)` — only with evidence for legacy + new.

---

## New product — Lead Execution CRM (Node) — **won’t match** legacy (deliberate)

This surface is a **separate** product module (`apps/crm-api` Fastify + Prisma, `apps/crm-web` Next.js). It is **not** claimed as legacy parity. Rows record intentional divergence.

| Topic | Status | Evidence / pointer | Notes |
|--------|--------|-------------------|--------|
| HTTP API & auth | **won’t match** | `apps/crm-api/src/` | Fastify routes under `/api/v1/*`, dev auth via `x-user-id` / JWT — not Flask session. |
| Lead stages & FSM | **won’t match** | `apps/crm-api/src/domain/fsm.ts`, Prisma `LeadStage` | Strict linear FSM (`INVITE_SENT`, …, `CLOSE_WON`) + mindset / day stages — not `LEAD_STATUS_OPTIONS` / legacy CTCS chain. |
| Wallet & pool | **won’t match** | `apps/crm-api/prisma/schema.prisma`, `pool-claim.service.ts` | Append-only `WalletLedger` + **idempotency keys** at claim; legacy uses computed balance + `current_owner` rules in `docs/blueprint/07_lead_pool.md`. |
| Reassign | **won’t match** | `lead-execution.service.ts` `reassignLead` / `systemReassignStaleLead` | Handler-only change, **stage reset** to `INVITED` (configurable), **no** wallet movement — verify against legacy handoff if ever unified. |
| UI shell | **won’t match** | `apps/crm-web/` | Next.js 14 App Router + Tailwind 4 + Zustand/React Query — not `frontend/` Vite dashboard registry. |
| Realtime | **won’t match** | `apps/crm-api/src/realtime/`, `docs/SOCKET_ROOMS.md` (in crm-api) | Socket.io room contract; legacy `realtime_ws` differs. |

**Owner / date:** engineering / 2026-04-16 — update this table when the Node CRM is intentionally aligned or bridged to legacy data.

---

## Backend v1 routers (new app — for wiring checks)

Aggregate: `backend/app/api/v1/router.py`. Domains include: `meta`, `auth`, `leads`, `team`, `system`, `analytics`, `execution`, `finance`, `other`, `settings`, `wallet`, `lead-pool`, `retarget`, `follow-ups`, `workboard`, `gate-assistant`, `realtime_ws` (WebSocket).

When mapping a legacy feature, point the **new** row to the concrete router module under `backend/app/api/v1/` if HTTP behavior is in scope.

---

## Maintenance

- When adding a dashboard screen: update **`DASHBOARD_ROUTE_DEFS`** first, then add or adjust a row in the **inventory** table above.
- When legacy parity is agreed: fill **Parity matrix** — never claim parity in chat or PR description without updating this file.
- **Implementation order (waves, stub→full checklist):** **`docs/PARITY_ROLLOUT_PLAN.md`**.
- **Legacy-aligned restructure + micro-slice template (layers + file index):** **`docs/APP_RESTRUCTURE_MICRO_PLAN.md`**.
- **Full behavior port (backend + frontend, lossless rules):** **`docs/LOSSLESS_FULLSTACK_PORT.md`**.
