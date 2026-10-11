"""Admins keep a long, sliding refresh session; other roles keep the normal window."""

from __future__ import annotations

from fastapi import Response

from app.core.auth_cookie import MYLE_REFRESH_COOKIE
from app.core.auth_cookies import issue_session_cookies
from app.core.config import settings
from app.core.jwt_tokens import decode_refresh_token
from app.models.user import User


def _refresh_cookie(user: User, *, remember_me: bool = False) -> tuple[int, dict]:
    response = Response()
    issue_session_cookies(response, user, remember_me=remember_me)
    header = next(
        v.decode() for k, v in response.raw_headers
        if k == b"set-cookie" and v.decode().startswith(f"{MYLE_REFRESH_COOKIE}=")
    )
    token = header.split(";", 1)[0].split("=", 1)[1]
    max_age = int(next(p.split("=", 1)[1] for p in header.split("; ") if p.lower().startswith("max-age=")))
    payload = decode_refresh_token(token, settings.secret_key)
    assert payload is not None
    return max_age, payload


def _user(role: str) -> User:
    return User(id=7, role=role, email=f"{role}@test.myle", fbo_id="T7", username=role, registration_status="approved")


def test_admin_refresh_session_is_long_lived_and_remembered() -> None:
    max_age, payload = _refresh_cookie(_user("admin"))
    assert max_age == settings.jwt_refresh_days_admin * 24 * 3600
    assert payload["remember"] is True
    assert payload["exp"] - payload["iat"] == settings.jwt_refresh_days_admin * 24 * 3600


def test_team_refresh_session_keeps_normal_window() -> None:
    max_age, payload = _refresh_cookie(_user("team"))
    assert max_age == settings.jwt_refresh_days * 24 * 3600
    assert payload["remember"] is False
    max_age, _ = _refresh_cookie(_user("leader"), remember_me=True)
    assert max_age == settings.jwt_refresh_days_remember * 24 * 3600
