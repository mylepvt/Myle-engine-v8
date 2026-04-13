#!/usr/bin/env bash
# Full local verification: Wave A + Phase7 + full pytest + FE lint/unit/build + npm audit + pip-audit + Playwright smoke.
# Run from repo root: bash scripts/verify_full_stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 1/10 verify_wave_a.sh =="
bash scripts/verify_wave_a.sh

echo "== 2/10 verify_phase7.sh =="
bash scripts/verify_phase7.sh

echo "== 3/10 pytest (full) =="
python3 -m pytest tests/ -q

echo "== 4/10 frontend lint =="
( cd frontend && npm run lint )

echo "== 5/10 frontend unit tests (Vitest) =="
( cd frontend && npm run test )

echo "== 6/10 frontend production build =="
( cd frontend && npm run build )

echo "== 7/10 npm audit (high+) =="
( cd frontend && npm audit --audit-level=high )

echo "== 8/10 pip-audit (backend/requirements.txt) =="
if python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"; then
  python3 -m pip install -q "pip-audit>=2.7"
  python3 -m pip_audit -r backend/requirements.txt
else
  echo "SKIP pip-audit: requires Python 3.10+ (security-pinned deps in requirements.txt)."
fi

echo "== 9/10 Playwright install (chromium) =="
( cd frontend && npx playwright install --with-deps chromium )

echo "== 10/10 Playwright E2E smoke =="
( cd frontend && npm run test:e2e )

echo "verify_full_stack: all steps passed."
