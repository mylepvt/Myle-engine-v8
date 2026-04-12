# 03 — Roles & Auth

> Source: `routes/auth_routes.py`, `auth_context.py`, `decorators.py`, `helpers.py`.

## 1. Roles

Three roles, hierarchical:

| Role | Scope | Typical landing |
|---|---|---|
| `admin` | Everything. Can see all leads, all users, all wallets. | `/admin` |
| `leader` | Own network (downline) + their own leads. Can approve team members under them. | `/leader` |
| `team` | Only their own assigned leads. | `/` (team dashboard) |

**User statuses:** `pending` (just registered), `approved`, `rejected`, `removed` (+ discipline `access_blocked=1`).

## 2. FBO ID — the real primary key

Every user has an `fbo_id` (MyLyf external ID). It is unique across all users and accepted as the login key in addition to `username`. Dedupe signature strips `#`, `-`, spaces and keeps only digits, so `#910-1234`, `9101234`, and `910 1234` all count as the same FBO.

```python
def _fbo_digits_for_uniqueness(raw: str) -> str:
    return re.sub(r'\D', '', (raw or ''))

def _normalize_registration_fbo(raw: str) -> str:
    return (raw or '').strip().lstrip('#').strip()
```

Uniqueness check on registration:
```sql
SELECT id FROM users
WHERE REPLACE(REPLACE(REPLACE(TRIM(COALESCE(fbo_id,'')),'#',''),'-',''),' ','') = ?
  AND TRIM(COALESCE(fbo_id,'')) != ''
```

## 3. Register Flow

`GET /register` → form.
`POST /register` fields: `username, password, email, fbo_id, upline_fbo_id, phone, is_new_joining, joining_date`.

Validation, in order:
1. All of `username/password/email/fbo_id/upline_fbo_id` non-empty.
2. `username` not taken (case/whitespace-insensitive: `LOWER(TRIM(username))`).
3. FBO digit-signature not already registered.
4. Phone not already registered (if phone given, non-empty).
5. **Upline resolve** — tries three lookups in order:
   a) exact match on `TRIM(fbo_id)`
   b) digit-signature match (approved users only)
   c) fallback: treat input as `username`
6. `validate_upline_assignment_roles('team', upline_role)` — only `leader` or `admin` can be upline for a new team member.

On success:
```sql
INSERT INTO users(username, password, role, fbo_id, upline_name, upline_username, upline_fbo_id,
                  phone, email, status, training_required, training_status, joining_date, name)
VALUES (?, PBKDF2_HASH(?), 'team', ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
```

- `password` stored via `generate_password_hash(password, method='pbkdf2:sha256')`.
- `status='pending'` — user cannot log in until admin approves.
- `training_required=1` if `is_new_joining` checkbox checked, else `0`.
- `training_status='pending'` if new joining, else `'not_required'`.

After insert, flash `"Registration submitted! Your account is pending admin approval."` and redirect to `/login`.

### Public upline lookup
`GET /api/lookup-upline-fbo?fbo_id=...` returns JSON (no auth). Used by the register page to preview the upline name before submit.

Response shape:
```json
{
  "found": true,
  "is_leader": true,          // true for both leader AND admin
  "is_valid_upline": true,    // same gate, newer clients
  "upline_role": "leader",
  "name": "rohit",
  "message": "Leader verified: rohit"
}
```
Errors: `found=false` (not registered) or `is_valid_upline=false` (role=team, or status≠approved).

## 4. Login Flow

`POST /login` accepts either:
- `fbo_id` field (primary), or
- `username` field (legacy)

Plus `password`.

Lookup order:
1. `SELECT * FROM users WHERE TRIM(fbo_id)=? AND fbo_id != ''`
2. Fallback: `SELECT * FROM users WHERE username=?`

### Password verification (legacy-compatible)

```python
stored = user['password']
if stored.startswith(('pbkdf2:', 'scrypt:', 'argon2:')):
    password_ok = check_password_hash(stored, password)
else:
    # legacy plain-text import — match literally, then auto-upgrade
    password_ok = (stored == password)
    if password_ok:
        UPDATE users SET password = PBKDF2_HASH(password) WHERE id = user.id
```

### Post-auth gates (in order)

1. Role `team|leader` and (`access_blocked=1` or `discipline_status='removed'`) → block with message:
   "System se remove kiya gaya due to non-performance. Admin se contact karein."
2. `status='pending'` → "Pending admin approval."
3. `status='rejected'` → "Your registration request was rejected."
4. `role in (team, leader)` and `status='approved'` → `ensure_upline_fields_for_user()` to heal missing `upline_username`/`upline_fbo_id`.

### Session creation

```python
session.clear()
session.permanent = True
session['user_id']        = user.id
session['username']       = user.username
session['fbo_id']         = user.fbo_id or user.username
session['role']           = user.role
session['has_dp']         = bool(user.display_picture)
session['training_status']= user.training_status
session['auth_version']   = AUTH_SESSION_VERSION    # bump to invalidate everyone
session['_csrf_token']    = secrets.token_hex(32)    # fresh token
session['display_name']   = user.name or user.username
```

Then `_log_activity(db, username, 'login', f"Role: {role}")`.

### Redirect by role
- `admin` → `/admin`
- `leader` → `/leader`
- `team`  → `/` (team dashboard)

## 5. Logout

`GET /logout` → log activity (`event_type='logout'`), `session.clear()`, redirect `/login`.

## 6. Forgot / Reset Password

### `GET/POST /forgot-password`
Input: `email`. If a user matches `LOWER(email) AND status='approved'`, create a reset token:
```python
token      = secrets.token_urlsafe(32)
expires_at = now_ist + 1 hour
INSERT INTO password_reset_tokens(username, token, expires_at) VALUES (?,?,?)
```
Email body contains `url_for('reset_password', token=token, _external=True)`.

If SMTP is not configured, flash the reset URL in the UI so the admin can share it manually.

**Always** respond with the same success page — never reveal whether the email exists (enumeration defense).

### `GET/POST /reset-password/<token>`
Validations:
- token exists and `used=0`
- `now_ist < expires_at`

On `POST`:
- new password ≥ 6 chars
- confirmation matches
- `UPDATE users SET password=PBKDF2_HASH(new)` + `UPDATE password_reset_tokens SET used=1`
- redirect `/login`

## 7. Decorators / guards

`decorators.py` exposes:
- `@login_required` — `session.get('user_id')` must exist; else redirect `/login`.
- `@admin_required` — `session.get('role') == 'admin'`.
- `@role_required('admin', 'leader')` — whitelist.
- `@approved_required` — `status='approved'` (blocks pending/rejected from reaching any protected URL).

**Rule:** every state-mutating endpoint re-checks the role from `session`. UI hiding a button is never sufficient.

## 8. `auth_context.py` helpers

```python
AUTH_SESSION_VERSION  # bump to force every user to log in again

def acting_username(session) -> str    # session['username']
def acting_user_id(session) -> int     # session['user_id']
def refresh_session_user(db, session)  # re-read users row to pick up role changes
```

## 9. Session rules

- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure=true` in prod, 30-day rolling.
- `SECRET_KEY` must be identical across all workers (never `secrets.token_hex(32)` per-worker).
- `auth_version` mismatch ⇒ reject and force re-login (used after schema changes).
- CSRF: `session['_csrf_token']`, sent as hidden input / `X-CSRF-Token` header on every POST. Mismatch ⇒ 400.

## 10. Admin approval flow

- New team/leader registration lands as `status='pending'`.
- Admin sees pending list at `/admin/approvals` (see file 12).
- Approve: `UPDATE users SET status='approved'`.
- Reject: `UPDATE users SET status='rejected'` + optional `admin_note` in activity log.

Leaders can ALSO approve team members whose `upline_username = <leader.username>` — see file 12.

## 11. Password hash upgrade

On every successful login with a legacy plain-text password, the stored value is immediately replaced with a pbkdf2 hash. No user action required. After the app has been running a while, all passwords will be upgraded; the plain-text branch can then be removed safely.

## 12. Rate limiting (recommendation — NOT in old app)

Old app has none. On rebuild, add:
- `/login` — 5 attempts / 15 min per IP, 10 / hour per username
- `/register` — 3 / hour per IP
- `/forgot-password` — 3 / hour per email

## Acceptance Checklist

- [ ] `/register` rejects duplicate username (case-insensitive), duplicate FBO digit-signature, duplicate phone
- [ ] `/register` requires upline role ∈ {`leader`,`admin`} with `status='approved'`
- [ ] `/register` creates user as `status='pending'`, never auto-approved
- [ ] `/api/lookup-upline-fbo?fbo_id=…` returns `is_valid_upline=false` for team-role uplines
- [ ] `/login` accepts either FBO ID or username in the same field
- [ ] `/login` supports pbkdf2, scrypt, argon2, AND legacy plain-text with auto-upgrade
- [ ] `/login` blocks `access_blocked=1` or `discipline_status='removed'` before session creation
- [ ] `/login` blocks `status in ('pending','rejected')` with correct message
- [ ] `session.clear()` runs before any session assignment on login (no stale fields)
- [ ] `/forgot-password` creates 32-byte urlsafe token, 1-hour expiry, and never leaks existence
- [ ] `/reset-password/<token>` enforces `used=0`, not expired, password ≥ 6 chars, match confirm
- [ ] `/logout` writes an `activity_log` row then clears the session
- [ ] Every protected route re-checks role from server session (never trusts frontend)
- [ ] CSRF token issued on login and rotated; every POST validates it
