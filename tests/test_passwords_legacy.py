"""Legacy-compatible password checks (Flask Werkzeug + plaintext upgrade path)."""

from app.core.passwords import (
    hash_password,
    should_upgrade_stored_password_to_bcrypt,
    verify_password_legacy_compatible,
)


def test_bcrypt_roundtrip() -> None:
    h = hash_password("secret")
    assert verify_password_legacy_compatible("secret", h)
    assert not verify_password_legacy_compatible("wrong", h)


def test_werkzeug_pbkdf2_sample() -> None:
    # pbkdf2:sha256:260000$salt$hash — use werkzeug to generate once
    from werkzeug.security import generate_password_hash

    wh = generate_password_hash("legacy-pass", method="pbkdf2:sha256")
    assert verify_password_legacy_compatible("legacy-pass", wh)
    assert should_upgrade_stored_password_to_bcrypt(wh)


def test_plaintext_then_upgrade() -> None:
    assert verify_password_legacy_compatible("x", "x")
    assert should_upgrade_stored_password_to_bcrypt("x")
