"""Minimal smoke tests establishing the fast/slow split ci.yaml relies on.

This is deliberately not comprehensive coverage — that's the scope of
issue #17 ("Establish a test suite"). These two tests only exist so the
CI pipeline's fast-tests/slow-tests distinction has something real to run
before #17 lands.
"""

import datetime as dt
from decimal import Decimal

import pytest
from app import crud, schemas


def test_first_invoice_of_the_year_gets_sequence_one(db_session):
    """Fast unit-level test: no HTTP layer, exercises crud directly."""
    crud.update_settings(
        db_session,
        schemas.SettingsSchema(business_name="Test Studio", address="Teststr. 1", tax_number="DE123456789"),
    )
    draft = crud.create_draft(
        db_session,
        schemas.InvoiceCreate(
            date="2026-01-15",
            client_name="Test Client",
            service_date=dt.date(2026, 1, 15),
            items=[schemas.InvoiceItemIn(description="Shoot", qty=Decimal("1"), price=Decimal("100"))],
        ),
    )
    assert draft.number is None
    assert draft.status == "draft"

    invoice = crud.issue_invoice(db_session, draft)

    assert invoice.number.endswith("-001")
    assert invoice.status == "offen"


@pytest.mark.slow
def test_settings_and_invoice_round_trip_via_api(client):
    """End-to-end smoke test through the real HTTP layer.

    Marked slow as a placeholder for the genuinely slow integration tests
    #17 will add (this one is not actually slow yet) — it demonstrates the
    marker split ci.yaml's fast/slow jobs rely on.
    """
    settings_resp = client.put(
        "/api/settings",
        json={"business_name": "Test Studio", "tax_number": "DE123456789", "kleinunternehmer": True},
    )
    assert settings_resp.status_code == 200

    create_resp = client.post(
        "/api/invoices",
        json={
            "date": "2026-01-15",
            "client_name": "Test Client",
            "items": [{"description": "Shoot", "qty": "1", "price": "100.00"}],
        },
    )
    assert create_resp.status_code == 201

    list_resp = client.get("/api/invoices")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
