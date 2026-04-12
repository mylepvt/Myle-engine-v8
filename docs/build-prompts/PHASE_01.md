# Phase 1 — Auth & identity

## Goal

Align **authentication and user lifecycle** with [`docs/blueprint/03_roles_and_auth.md`](../blueprint/03_roles_and_auth.md): login identity (fbo_id / username), password verification, JWT httpOnly cookies, pending/rejected/blocked behavior, upline validation **as implemented or explicitly gap-filled** — without breaking existing cookie/JWT flow in [`backend/app/api/v1/auth.py`](../../backend/app/api/v1/auth.py).

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/03_roles_and_auth.md`](../blueprint/03_roles_and_auth.md)
- [`backend/app/api/v1/auth.py`](../../backend/app/api/v1/auth.py), [`backend/app/api/deps.py`](../../backend/app/api/deps.py)
- [`backend/app/services/login_identity.py`](../../backend/app/services/login_identity.py)
- [`backend/app/core/jwt_tokens.py`](../../backend/app/core/jwt_tokens.py), [`auth_cookies.py`](../../backend/app/core/auth_cookies.py), [`auth_context.py`](../../backend/app/core/auth_context.py)
- [`backend/app/models/user.py`](../../backend/app/models/user.py), [`backend/app/schemas/auth.py`](../../backend/app/schemas/auth.py)
- Legacy: [`backend/legacy/myle_dashboard_main3/routes/`](../../backend/legacy/myle_dashboard_main3/routes/) — auth/register/login files (names vary; search `login`, `register`)

## Paste prompt

**Phase 1 — Auth system on top of existing vl2 contracts.**

**Do not modify files unless listed in Allowed paths.** No assumptions; match legacy behavior where [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) claims parity.

Implement or fix only: bcrypt + JWT cookies, login/register/logout flows, pending/rejected/access_blocked/discipline gates, upline/`fbo_id` validation per blueprint — within allowed files. Return correct HTTP status codes for edge cases.

## Allowed paths

- `backend/app/api/v1/auth.py`
- `backend/app/schemas/auth.py`
- `backend/app/services/login_identity.py`
- `backend/app/models/user.py` (if columns needed + migration in same PR)
- `backend/app/core/jwt_tokens.py`, `auth_cookies.py`, `auth_context.py`, `passwords.py` (only if required by auth change)
- `backend/alembic/versions/*.py` (if `User` schema changes)
- `backend/tests/**/test_auth*.py` or new tests under `backend/tests/`

## Forbidden

- Changing lead FSM, workboard, or wallet in this PR.
- New API prefix; keep `/api/v1/auth/*` patterns.
- Disabling rate limits or `AUTH_DEV_LOGIN_ENABLED` production safeguards without explicit product decision.

## Verify

```bash
cd backend && pytest
```

Manual: login, refresh, logout, `GET /api/v1/auth/me` with cookies (see [`backend/README.md`](../../backend/README.md) if present).

## Lock

- Parity row for auth flows in [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) if behavior is claimed.
- [`docs/MYLE_VL2_CHECKLIST.md`](../MYLE_VL2_CHECKLIST.md) backend auth section.
