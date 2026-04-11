# Myle-Dashboard-main-3 — `services/` (reference snapshot)

Verbatim modules from the legacy Flask monolith (same tree as **`Myle-Dashboard-main-3/services/`**). They import **`database`**, **`helpers`**, and SQLite-shaped lead/user rows — use as **read-only reference** when comparing behavior to vl2.

| File | Role |
|------|------|
| **`rule_engine.py`** | Pipeline rules, status/call buckets, validation — canonical rules before `helpers.py` re-exports. |
| **`wallet_ledger.py`** | Pool-spend / `current_owner` SQL for wallet math. |
| **`scoring_service.py`** | Daily scores / discipline hooks (SQLite + `activity_log`). |
| **`hierarchy_lead_sync.py`** | Lead updates / hierarchy sync helpers. |
| **`day2_certificate_pdf.py`** | Day 2 certificate PDF generation (`reportlab`). |

**vl2 ports** live under **`backend/app/services/`** and **`backend/app/core/pipeline_rules.py`** (see parent **`../README.md`** table *`services/` (full tree snapshot + vl2 ports)*).
