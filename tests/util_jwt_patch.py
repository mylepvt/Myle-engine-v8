"""Align JWT signing (``auth_cookies``) with decode (``auth`` / ``deps``) in tests."""

from __future__ import annotations

import pytest


def patch_jwt_settings(monkeypatch: pytest.MonkeyPatch, **settings_update: object) -> object:
    """
    Issue and verify cookies with the same ``secret_key`` as route handlers.

    Tests that only patch ``app.api.v1.auth.settings`` leave
    ``app.core.auth_cookies.settings`` on the real secret → 401 on protected routes.
    """
    import app.api.deps as deps_mod
    import app.api.v1.auth as auth_mod
    from app.core.config import settings

    base = {"secret_key": "unit-test-jwt-secret-at-least-32-chars!!"}
    base.update(settings_update)
    patched = settings.model_copy(update=base)
    monkeypatch.setattr(auth_mod, "settings", patched)
    monkeypatch.setattr(deps_mod, "settings", patched)
    monkeypatch.setattr("app.core.auth_cookies.settings", patched)
    return patched
