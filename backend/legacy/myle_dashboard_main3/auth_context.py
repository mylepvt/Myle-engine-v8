"""Request-scoped auth: session holds user_id, username, fbo_id, role, display_name (set on login / profile)."""
from __future__ import annotations

from flask import has_request_context, session

from database import get_db

# Bump when session shape changes so old cookies are forced to re-login (clean session).
AUTH_SESSION_VERSION = 2


def acting_user_id() -> int | None:
    uid = session.get('user_id')
    if uid is None:
        return None
    try:
        return int(uid)
    except (TypeError, ValueError):
        return None


def acting_username() -> str | None:
    if not has_request_context():
        return None
    u = (session.get('username') or '').strip()
    return u or None


def acting_fbo_id() -> str:
    return (session.get('fbo_id') or '').strip()


def refresh_session_user(user_id) -> None:
    """Reload identity fields from DB into session (after profile / admin edit). Does not touch auth_version or CSRF."""
    if user_id is None:
        return
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not user:
        return
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["fbo_id"] = user["fbo_id"] or user["username"]
    session["display_name"] = user["name"] or ""
