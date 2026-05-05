#!/usr/bin/env bash
# Apply Alembic migrations to the database in DATABASE_URL (same as API).
# Run from repo root with env loaded (e.g. source .env): bash scripts/run_alembic_upgrade.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
exec alembic upgrade heads
