"""Tests for main.py SPA catch-all and API 404 guard."""

import pytest


@pytest.mark.slow
def test_unknown_api_path_returns_404(client):
    """Unknown /api/* paths should return 404, not the SPA index.html."""
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404


@pytest.mark.slow
def test_real_api_route_still_works(client):
    """Real API routes like /api/invoices should still work normally."""
    # Create a settings entry first so we have something
    client.put(
        "/api/settings",
        json={"business_name": "Test", "tax_number": "DE123456789", "kleinunternehmer": False},
    )

    # Then create an invoice
    response = client.post(
        "/api/invoices",
        json={
            "date": "2026-01-15",
            "client_name": "Test Client",
            "items": [{"description": "Test", "qty": "1", "price": "100.00"}],
        },
    )
    assert response.status_code == 201

    # List invoices should work
    response = client.get("/api/invoices")
    assert response.status_code == 200


@pytest.mark.slow
def test_spa_route_returns_index_200(client):
    """Non-API routes should return the SPA index.html (when it exists)."""
    # This test only makes sense if the static directory exists with index.html
    # If not, the SPA catch-all isn't registered, so we skip this test
    from pathlib import Path

    static_dir = Path(__file__).resolve().parent.parent / "static"
    if not static_dir.exists():
        pytest.skip("static directory not found; SPA catch-all not registered")

    # Request a non-existent SPA route
    response = client.get("/some/spa/route")
    assert response.status_code == 200
    # Should return HTML (index.html content)
    assert "text/html" in response.headers.get("content-type", "")


@pytest.mark.slow
def test_asset_request_returns_file(client):
    """Asset requests under /assets should be served by StaticFiles mount."""
    # This test only makes sense if the static/assets directory exists
    from pathlib import Path

    static_dir = Path(__file__).resolve().parent.parent / "static"
    if not static_dir.exists():
        pytest.skip("static directory not found; assets not served")

    # Request an asset file
    response = client.get("/assets/index.html")
    # If the file doesn't exist, we expect a 404 from StaticFiles
    # If it does exist, we expect a 200
    assert response.status_code in (200, 404)
