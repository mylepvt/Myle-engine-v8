#!/usr/bin/env bash
# Phase 7 — Testing & Safety: auth + leads flow + wallet (API pytest subset).
# Run from repo root: bash scripts/verify_phase7.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -m pytest \
  tests/test_api_v1_auth_login.py \
  tests/test_api_v1_auth_me.py \
  tests/test_api_v1_auth_refresh.py \
  tests/test_api_v1_auth_dev_login.py \
  tests/test_auth_rate_limit.py \
  tests/test_api_v1_leads.py \
  tests/test_api_v1_workboard.py \
  tests/test_api_v1_follow_ups.py \
  tests/test_api_v1_retarget.py \
  tests/test_api_v1_wallet.py \
  -q
