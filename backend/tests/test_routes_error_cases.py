"""Route-level 404/422 coverage across the invoices and expenses routers
(issue #17).

Backfill against existing, unmodified behavior: the `_get_or_404` helper in
`routers/invoices.py` and the equivalent inline check in
`routers/expenses.py` already return 404s correctly, and FastAPI/Pydantic
already reject malformed bodies with 422s. Nothing currently exercises
either path through the real HTTP layer.
"""


def test_get_nonexistent_invoice_returns_404(client):
    resp = client.get("/api/invoices/999999")
    assert resp.status_code == 404


def test_mark_paid_on_nonexistent_invoice_returns_404(client):
    resp = client.post("/api/invoices/999999/mark-paid")
    assert resp.status_code == 404


def test_delete_nonexistent_invoice_returns_404(client):
    resp = client.delete("/api/invoices/999999")
    assert resp.status_code == 404


def test_delete_nonexistent_expense_returns_404(client):
    resp = client.delete("/api/expenses/999999")
    assert resp.status_code == 404


def test_create_invoice_missing_required_field_returns_422(client):
    """`items` is a required field on `InvoiceCreate`; omitting it entirely
    is a schema-validation failure (422), distinct from the app's own 400
    for a *present but empty* `items` list (see `routers/invoices.py`).
    """
    resp = client.post(
        "/api/invoices",
        json={"date": "2026-01-01", "client_name": "Missing Items Co."},
    )
    assert resp.status_code == 422


def test_create_invoice_malformed_date_returns_422(client):
    resp = client.post(
        "/api/invoices",
        json={
            "date": "not-a-date",
            "client_name": "Bad Date Co.",
            "items": [{"description": "Shoot", "qty": "1", "price": "100.00"}],
        },
    )
    assert resp.status_code == 422


def test_create_invoice_empty_items_list_returns_400_not_422(client):
    """The app's own guard rejects a *present* empty list with a plain 400
    (not 422) — kept here as a contrast to the 422 cases above so a change
    to either code doesn't silently swap the two.
    """
    resp = client.post(
        "/api/invoices",
        json={"date": "2026-01-01", "client_name": "Empty Items Co.", "items": []},
    )
    assert resp.status_code == 400


def test_create_expense_missing_required_field_returns_422(client):
    resp = client.post("/api/expenses", json={"date": "2026-01-01", "category": "software"})
    assert resp.status_code == 422
