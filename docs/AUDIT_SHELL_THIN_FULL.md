# Full audit — shells, thin surfaces & gaps (beyond P0/P1)

**Companion:** Priority fixes stay in [`GAP_PRIORITY_P0_P1.md`](./GAP_PRIORITY_P0_P1.md).  
**Deep audit:** Full stack security, architecture, data, tests, CI/CD, ops, performance, a11y/i18n, dependencies in [`AUDIT_DEEP_FULL.md`](./AUDIT_DEEP_FULL.md).  
**This doc:** Complete inventory of **list/shell UIs**, **thin pages**, **backend-only APIs**, and **dead/duplicate paths** so nothing is “hidden” in Windsurf-era drift.

---

## 1. `ShellStubPage` — generic list + note (`SystemStubResponse`)

Registry: `ui: { kind: 'shell-api', apiPath: '...' }` → [`ShellStubPage.tsx`](../frontend/src/pages/ShellStubPage.tsx).

| Dashboard path | API | Notes |
|----------------|-----|--------|
| `other/leaderboard` | `GET /api/v1/other/leaderboard` | Backend ranks users by **`daily_scores`** — **not empty**, but UI is still **one generic list** (not a full leaderboard product page). |
| `other/live-session` | `GET /api/v1/other/live-session` | Driven by **`app_settings`** (`live_session_*`). Empty copy until admin sets keys. |
| `settings/app` | `GET /api/v1/settings/app` | Admin — **`app_settings`** key/value rows; shell list. |
| `settings/help` | `GET /api/v1/settings/help` | **Static bundled articles** in API — not a CMS. |
| `settings/org-tree` | `GET /api/v1/settings/org-tree` | Org tree payload — thin vs full org product. |

**Derived map:** [`SHELL_STUB_API_PATHS`](../frontend/src/config/dashboard-registry.ts) in `dashboard-registry.ts`.

---

## 2. Same “InsightList / signals” pattern — dedicated pages (not `ShellStubPage` component)

| Surface | Page | API / behaviour | Gap |
|---------|------|-----------------|-----|
| System → Activity log, Day 2 report | [`AnalyticsSurfacePage.tsx`](../frontend/src/pages/AnalyticsSurfacePage.tsx) | `useAnalyticsSurfaceQuery` → admin analytics endpoints | **List + note**; not a full BI screen. |
| System → Decision engine, Coaching | [`SystemSurfacePage.tsx`](../frontend/src/pages/SystemSurfacePage.tsx) (`surface !== 'training'`) | System/coaching/decision routes | **InsightList “signals” only** — no rich coaching UI. |
| System → Training (canonical) | [`SystemSurfacePage.tsx`](../frontend/src/pages/SystemSurfacePage.tsx) (`surface === 'training'`) | DB-backed videos + certification test | **Full** relative to other system surfaces. |
| Wallet → Recharges | [`FinanceRechargesPage.tsx`](../frontend/src/pages/FinanceRechargesPage.tsx) | `GET /api/v1/finance/recharges` + manual wallet adjustment form | Top block is **stub-shaped API** (recent ledger as `SystemStubResponse`); **form is real** for admin credits. |

---

## 3. Work → Intelligence (feature-flag)

| Path | Page | Notes |
|------|------|--------|
| `intelligence` | [`IntelligenceWorkPage.tsx`](../frontend/src/pages/IntelligenceWorkPage.tsx) | **Copy-only placeholder** when `meta.features.intelligence` is true; **redirect to `/dashboard`** when false. No in-product “intelligence” workflows wired. |

---

## 4. Duplicate / overlapping journeys

| Topic | Paths | Risk |
|-------|--------|------|
| Training | **`system/training`** (gate + `SystemSurfacePage`) vs **`training`** ([`TrainingPage.tsx`](../frontend/src/pages/TrainingPage.tsx)) | Two nav entries can mean **same user confusion** — align on one canonical route or redirect. |
| Analytics | **`analytics/activity-log`**, **`analytics/day-2-report`** vs **`analytics`** ([`AnalyticsPage.tsx`](../frontend/src/pages/AnalyticsPage.tsx)) | **Two mental models** (system monitoring vs full dashboard); **export buttons** on full page are **dead** (see P0-2). |

---

## 5. Thin or explicitly “future” pages

| Path | Page | What user sees |
|------|------|----------------|
| `team/my-team` | [`MyTeamPage.tsx`](../frontend/src/pages/MyTeamPage.tsx) | **Self / placeholder** until downline reporting exists. |
| `team/enrollment-approvals` | [`EnrollmentApprovalsPage.tsx`](../frontend/src/pages/EnrollmentApprovalsPage.tsx) | Copy says **workflow not fully persisted**; empty queue most of the time; rows may render as **raw JSON**. |
| `finance/wallet` | [`WalletPage.tsx`](../frontend/src/pages/WalletPage.tsx) | **Narrow** wallet view (balance + recent + paged ledger) — not a full finance console. |

---

## 6. Backend-only (no `/dashboard/...` route)

Documented in [`CORE_APP_STRUCTURE.md`](./CORE_APP_STRUCTURE.md) — still true:

- **`GET /api/v1/execution/*`** — personal funnel, at-risk, lead ledger, etc.
- **`GET /api/v1/finance/budget-export`**, **`/finance/monthly-targets`**, **`/finance/lead-pool`** (and similar) — summaries without shell routes.
- **`GET /api/v1/settings/all-members`** — redirects narrative to **Team → Members**.

These are **gaps only if legacy had screens** for them; otherwise they are **intentional API-only**.

---

## 7. Infra / product backlog (not “shell” but listed everywhere)

| Area | Doc |
|------|-----|
| OAuth/OTP, org hierarchy UX, i18n, full PWA | [`MYLE_VL2_CHECKLIST.md`](./MYLE_VL2_CHECKLIST.md) “Outstanding” |
| Legacy evidence | [`LEGACY_PARITY_MAPPING.md`](./LEGACY_PARITY_MAPPING.md) — Phase 0.1 table still empty |

---

## 8. Dead code path (low priority)

| Item | Detail |
|------|--------|
| `surface: 'placeholder'` | Type exists in [`dashboard-registry.ts`](../frontend/src/config/dashboard-registry.ts); **no** `DASHBOARD_ROUTE_DEFS` entry uses it → [`DashboardPlaceholderPage.tsx`](../frontend/src/pages/DashboardPlaceholderPage.tsx) is **unused** in normal nav. |

---

## 9. Quick counts

| Category | Count (approx.) |
|----------|-----------------|
| Routes using **`ShellStubPage`** | **5** (leaderboard, live-session, settings ×3) |
| Routes using **stub-shaped list** but dedicated page | **3+** (analytics surfaces, non-training system surfaces, finance recharges top block) |
| **Thin / explicit placeholder** copy | **3** (Intelligence, My Team, Enrollment approvals) |
| **Backend-only** execution/finance clusters | **Many** (no nav) |

---

*Generated as a repo-wide pass over registry + pages + router; update this file when a surface graduates from shell → full.*
