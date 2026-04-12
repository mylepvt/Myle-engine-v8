# User-visible gaps — P0 / P1 priority

**Purpose:** Ship and support decisions — what to fix first when something “feels broken” or “not like legacy.”  
**Not:** A full parity matrix (that stays in [`LEGACY_PARITY_MAPPING.md`](./LEGACY_PARITY_MAPPING.md) once evidence exists).  
**Deep audit:** Full stack security, architecture, data, tests, CI/CD, ops, performance, a11y/i18n, dependencies in [`AUDIT_DEEP_FULL.md`](./AUDIT_DEEP_FULL.md).

**Full inventory (shells, thin pages, backend-only):** [`AUDIT_SHELL_THIN_FULL.md`](./AUDIT_SHELL_THIN_FULL.md) — complete table-by-table list beyond this priority shortlist.  
**Deep audit (security, architecture, CI, tests, ops):** [`AUDIT_DEEP_FULL.md`](./AUDIT_DEEP_FULL.md).

**Targets**

- **MVP ship:** Close **P0** first, then **P1** as bandwidth allows.
- **Legacy 1:1:** Phase 0.1 **nav table** is filled (repo-derived, `LEGACY_PARITY_MAPPING.md`); **per-row parity evidence** (`match` / screenshots) still required — no code priority list replaces that.

### Verification snapshot (re-check)

| ID | Status | Notes |
|----|--------|--------|
| **P0-1** | **In progress** | Phase 0.1 **nav export** table filled (2026-04-12, `LEGACY_PARITY_MAPPING.md`); matrix rows still **TBD** until behavioral evidence per surface. |
| **P0-2** | **Fixed** | `AnalyticsPage` → **`POST /api/v1/analytics/export`**; CSV + **real `.xlsx`** (openpyxl). Tests in `tests/test_api_v1_analytics.py`. |
| **P0-3** | **Fixed** | Pipeline routes aligned with FE; **`tests/test_api_v1_pipeline.py`** covers view/metrics/statuses + double-prefix **404** regression. |
| **P0-4** | **Fixed** | Duplicate **`path: 'training'`** removed from registry earlier; **orphan `"training"` key** in `dashboard-route-roles.json` removed + dead **`TrainingPage`** route removed (canonical: **`system/training`** → `SystemSurfacePage`). |
| **P0-5** | **Fixed** | **`GET /api/v1/settings-enhanced/*`** — `settings_enhanced` router was implemented but **not** included in **`app/api/v1/router.py`** (frontend `use-settings-query.ts` → 404). **Fixed:** `include_router(..., prefix="/settings-enhanced")`; schemas: **`Any`** for audit `details`, **`pattern`** (not `regex`), **`ConfigDict`** for dynamic update model. **Regression:** `tests/test_api_v1_shell_routes.py::test_settings_enhanced_mounted_unauthenticated_is_401_not_404`. |

---

## P0 — Fix before calling the area “done” or “prod-safe”

| ID | Gap | Why P0 | Where to look |
|----|-----|----------|----------------|
| **P0-1** | **Legacy parity not fully evidenced** | Nav export table exists; **per-feature** evidence (`match` / tests / screenshots) still required before “same as old app.” | [`docs/LEGACY_PARITY_MAPPING.md`](./LEGACY_PARITY_MAPPING.md) — Phase 0.1 + matrix |
| **P0-2** | **Analytics export is dead UI** | “Export CSV / Excel” buttons do nothing — users assume data export works. | [`frontend/src/pages/AnalyticsPage.tsx`](../frontend/src/pages/AnalyticsPage.tsx) (export block ~L160+) |
| **P0-3** | **Pipeline / critical APIs must match deployed routes** | Wrong path = 404 and empty screens (recent class of bug: router prefix vs path). | Backend: [`backend/app/api/v1/pipeline.py`](../backend/app/api/v1/pipeline.py) + [`router.py`](../backend/app/api/v1/router.py); FE: [`use-pipeline-query.ts`](../frontend/src/hooks/use-pipeline-query.ts) |
| **P0-4** | **Training gate confusion (two training entry points)** | Same journey reachable via more than one nav path → support tickets (“which training?”). | [`frontend/src/config/dashboard-registry.ts`](../frontend/src/config/dashboard-registry.ts) (`system/training` vs `training`); [`docs/CORE_APP_STRUCTURE.md`](./CORE_APP_STRUCTURE.md) |
| **P0-5** | **Settings enhanced API not mounted** | FE calls **`/api/v1/settings-enhanced/*`**; router omitted → **404** on Settings flows. | [`backend/app/api/v1/router.py`](../backend/app/api/v1/router.py), [`settings_enhanced.py`](../backend/app/api/v1/settings_enhanced.py), [`use-settings-query.ts`](../frontend/src/hooks/use-settings-query.ts) |

---

## P1 — Visible limitation or thin UX; ship with clear expectation

| ID | Gap | Why P1 | Where to look |
|----|-----|--------|----------------|
| **P1-1** | **My Team = mostly self / placeholder for org** | Copy promises more than V1 delivers vs legacy “downline” views. | [`frontend/src/pages/MyTeamPage.tsx`](../frontend/src/pages/MyTeamPage.tsx) |
| **P1-2** | **Community shells (Leaderboard / Live session)** | UI is list/stub-style even when API has data or `app_settings` keys. | Shell: [`ShellStubPage.tsx`](../frontend/src/pages/ShellStubPage.tsx); API: [`other_pages.py`](../backend/app/api/v1/other_pages.py) |
| **P1-3** | **Settings → General / Help / Org tree** | Thin or static vs a full admin console. | API: [`settings_pages.py`](../backend/app/api/v1/settings_pages.py); registry shell paths in [`dashboard-registry.ts`](../frontend/src/config/dashboard-registry.ts) |
| **P1-4** | **Finance → Recharges** | Stub-style surface; budget/monthly targets live under API-only routes per IA. | [`FinanceRechargesPage.tsx`](../frontend/src/pages/FinanceRechargesPage.tsx), [`finance_surfaces.py`](../backend/app/api/v1/finance_surfaces.py) |
| **P1-5** | **Dual Analytics entry** | Full **`/dashboard/analytics`** vs **System → activity log / Day 2 report** — fine if intentional; confusing if not. | [`DashboardNestedPage.tsx`](../frontend/src/pages/DashboardNestedPage.tsx), [`dashboard-registry.ts`](../frontend/src/config/dashboard-registry.ts) |
| **P1-6** | **Execution / extra finance APIs not in nav** | Power users expect screens if legacy had them. | [`docs/CORE_APP_STRUCTURE.md`](./CORE_APP_STRUCTURE.md) “Removed from nav” |

---

## P2 / backlog (already in roadmap docs)

- OAuth / OTP, org-wide reporting lines, full i18n, full PWA offline — see [`MYLE_VL2_CHECKLIST.md`](./MYLE_VL2_CHECKLIST.md) “Outstanding (optional / future).”

---

## Suggested order of execution (engineering)

1. **P0-2** — Wire export to real endpoints or hide buttons until implemented (parity: match legacy export behavior when evidence exists).
2. **P0-4** — Single canonical training path + redirect or hide duplicate nav item.
3. **P1-1** — Align copy with product (or add minimal downline list when API exists).
4. **P1-2 / P1-3** — Product call: upgrade shell → full page per surface.

---

## Maintenance

When a row is fixed, remove or downgrade it here and add a line to [`MYLE_VL2_CHECKLIST.md`](./MYLE_VL2_CHECKLIST.md) or the parity matrix if applicable.
