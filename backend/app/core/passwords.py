"""Password hashing (bcrypt). Dev seed hash must match Alembic migration."""

from __future__ import annotations

import bcrypt
from werkzeug.security import check_password_hash as werkzeug_check_password_hash

# Same plain password and bcrypt hash as migration `20250410_0005_dev_login_passwords`.
# Local/dev only — rotate in real deployments.
DEV_LOGIN_PASSWORD_PLAIN = "myle-dev-login"
DEV_LOGIN_BCRYPT_HASH = (
    "$2b$12$9Btds2bpJbyCRS7P2HUePeE6pJKr1DiIlPphCBt71eti7cNuViMjm"
)


def verify_password(plain: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password_legacy_compatible(plain: str, stored: str) -> bool:
    """Match Flask ``routes/auth_routes.login``: bcrypt, Werkzeug pbkdf2/scrypt/argon2, or plaintext."""
    if not stored:
        return False
    s = stored.strip()
    if s.startswith("$2a$") or s.startswith("$2b$") or s.startswith("$2y$"):
        return verify_password(plain, s)
    if s.startswith(("pbkdf2:", "scrypt:", "argon2:")):
        try:
            return werkzeug_check_password_hash(s, plain)
        except (ValueError, AttributeError):
            return False
    return s == plain


def should_upgrade_stored_password_to_bcrypt(stored: str) -> bool:
    """True if DB still holds legacy plaintext or Werkzeug hash (upgrade on successful login)."""
    if not stored:
        return False
    s = stored.strip()
    if s.startswith("$2a$") or s.startswith("$2b$") or s.startswith("$2y$"):
        return False
    return True
