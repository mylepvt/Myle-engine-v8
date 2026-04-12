# Phase 1 — Auth: blueprint vs vl2 implementation

**Blueprint:** [`docs/blueprint/03_roles_and_auth.md`](blueprint/03_roles_and_auth.md)  
**vl2:** [`backend/app/api/v1/auth.py`](../backend/app/api/v1/auth.py), [`backend/app/models/user.py`](../backend/app/models/user.py), [`backend/app/services/login_identity.py`](../backend/app/services/login_identity.py)

This document maps **expected legacy behavior** to **current vl2** so Phase 1 work is gap-fill, not blind rewrite.

---

## Implemented (vl2)

| Capability | Where |
|------------|--------|
| Password login | `POST /api/v1/auth/login` — `fbo_id` field accepts **FBO or username** per [`login_identity.resolve_user_by_fbo_or_username`](../backend/app/services/login_identity.py) |
| bcrypt + legacy hash verification | [`passwords.py`](../backend/app/core/passwords.py) |
| JWT access + refresh httpOnly cookies | [`auth_cookies.py`](../backend/app/core/auth_cookies.py), `POST /refresh`, `POST /logout` |
| `GET /api/v1/auth/me` | Cookie-based |
| Dev login | `POST /api/v1/auth/dev-login` (gated by env) |
| Identity refresh | `POST /api/v1/auth/sync-identity` |
| Org link | `User.upline_user_id` FK for leader downline |

---

## Gaps (typical parity backlog)

| Blueprint expectation | vl2 gap | Suggested fix area |
|----------------------|---------|-------------------|
| `POST /register` with upline validation, pending status | No public registration route in `auth.py` matching Flask flow | New router + `User` columns: `status`, phone uniqueness, training flags |
| `GET /api/lookup-upline-fbo` | Not in vl1 router (verify `router.py`) | Public read-only endpoint + `User` query by `fbo_id` / digits |
| Pending / rejected / cannot login | No `status` column on `User` — all dev seeds are active | Migration + login guard in `login_with_password` |
| `access_blocked`, `discipline_status=removed` | Not on model | Migration + Hindi/English messages per blueprint |
| Username unique case-insensitive | `username` nullable, not unique | Migration + registration validation |
| Forgot / reset password | Blueprint describes token table | `password_reset_tokens` model + routes |

---

## Exit criteria (Phase 1 “done” for a slice)

- [ ] Login rejects non-approved users once `status` exists — tests in `tests/test_api_v1_auth_login.py`
- [ ] Register + lookup (if shipped) covered by tests; no secrets in repo
- [ ] Row in [`LEGACY_PARITY_MAPPING.md`](LEGACY_PARITY_MAPPING.md) if claiming “same as legacy”

**Do not** change lead FSM in the same PR as auth migrations unless unavoidable — prefer stacked PRs per [`CONTROLLED_BUILD_PIPELINE.md`](CONTROLLED_BUILD_PIPELINE.md).
