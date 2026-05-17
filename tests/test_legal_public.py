from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_privacy_page_is_public_and_contains_expected_copy() -> None:
    response = client.get("/privacy")

    assert response.status_code == 200
    assert "MYLE Privacy Policy" in response.text
    assert "karanveer125@gmail.com" in response.text
    assert response.headers.get("cache-control") == "no-cache, no-store, must-revalidate"


def test_terms_page_alias_resolves() -> None:
    response = client.get("/terms-of-service")

    assert response.status_code == 200
    assert "Terms of Service" in response.text
    assert "Prohibited conduct" in response.text


def test_data_deletion_page_is_public_and_actionable() -> None:
    response = client.get("/data-deletion")

    assert response.status_code == 200
    assert "User Data Deletion Instructions" in response.text
    assert "usually within 30 days" in response.text
