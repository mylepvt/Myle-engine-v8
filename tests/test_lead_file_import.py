"""Unit tests for lead PDF import helpers."""

from app.services.lead_file_import import normalize_phone_digits


def test_normalize_phone_digits_last_ten():
    assert normalize_phone_digits("+91 98765 43210") == "9876543210"
    assert normalize_phone_digits("919876543210") == "9876543210"
