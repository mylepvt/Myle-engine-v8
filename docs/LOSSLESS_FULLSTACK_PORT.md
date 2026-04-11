# Lossless full-stack port — behavior (backend + frontend)

**Goal:** Har feature jisko ship karte ho, uska **poora behavior** legacy (ya agreed spec) se **semantically match** kare — sirf UI shell ya stub API nahi.

**“Lossless” yahan ka matlab:** Same inputs → same **observable** outputs (DB writes, emails, wallet, visibility rules, errors, timezones), roles ke hisaab se — code line-by-line copy zaroori nahi.

---

## 1. Pehle freeze karo: *kya* match karna hai

| Artifact | Kyun |
|----------|------|
| **Legacy ref** | Route / screen name + `helpers.py` / `routes/*` pointers (ya `legacy_row_snapshots` se sample row). |
| **Behavior list** | Happy path + edge cases: empty state, forbidden role, validation errors, idempotency. |
| **Data contract** | Kaunse fields DB/API me zaroori; kaun `meta` / JSON extension me. |

Evidence + matrix row: **`docs/LEGACY_PARITY_MAPPING.md`** — yahi par **“match”** claim allowed hai.

---

## 2. Backend (authoritative logic)

1. **Source of truth** legacy me: `app.py` + `helpers.py` + relevant `routes/*.py` — pehle yahan se rules nikaalo (status transitions, pool price, IST, etc.).
2. **vl2 me** logic **`app/services/`** (ya domain module) me rakho; routers thin rakho (HTTP + auth + validation only).
3. **API contract** stable rakho: request/response shapes `openapi` / `export_openapi` se align; breaking change = version bump ya explicit migration.
4. **Stub mat chhodo “done” feature ke liye** — `ShellStubPage` + placeholder JSON sirf tab jab feature explicitly WIP ho; ship se pehle **`surface: 'full'`** + real handlers.

---

## 3. Frontend (same rules, visible UX)

1. **`dashboard-registry.ts`**: route **`full`** + real page component; role gates **`dashboard-route-roles.json`** ke through hi.
2. **Server state** = TanStack Query — loading / error / retry; optimistic updates sirf jahan legacy me bhi equivalent instant feedback tha (ya product ne maanga).
3. **Validation** client par UX ke liye; **server rejection** ko bhi handle karo (same messages jahan legacy ne diye).
4. **Flags** (`GET /api/v1/meta`) — Intelligence jaisi cheezein nav se hide jab feature off ho.

---

## 4. Data path (lossless storage)

- Normalized tables me jo map ho sakta hai → Alembic + models.
- Jo abhi model me nahi → **`legacy_row_snapshots`** (import) ya future JSON column — **mat drop karo** agar baad me parity chahiye.
- Import mapping: **`backend/legacy/LEGACY_TO_VL2_MAPPING.md`**.

---

## 5. Verify (definition of done)

| Check | Tool |
|-------|------|
| API golden cases | `pytest` — router + service, same fixtures as legacy scenarios |
| Role isolation | Tests: `team` vs `leader` vs `admin` |
| Regression | CI: `backend` + `frontend` lint/test/build |

Manual: legacy aur vl2 par **same user / same lead** se 1–2 critical flows side-by-side — evidence id matrix me attach karo.

---

## 6. Anti-patterns (yeh “lossless” nahi hai)

- Sirf nav item add karna, API 501 / empty list.
- Frontend validation alag, backend alag — **ek hi rule** (server final).
- “Baad me fix” ke saath **stub** ko production me **full** samajhna.

---

## See also

- **Route inventory + stub vs full:** `docs/LEGACY_PARITY_MAPPING.md`
- **Rollout order:** `docs/PARITY_ROLLOUT_PLAN.md`
- **Data import 100% archive:** `backend/legacy/LEGACY_TO_VL2_MAPPING.md` (§9 `legacy_row_snapshots`)
