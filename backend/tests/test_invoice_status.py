"""Coverage for `crud.set_invoice_status` (issue #17).

Backfill against existing, unmodified behavior: marking an invoice paid
sets `paid_date`, and reopening it clears that date again. Nothing
currently protects this pairing — these tests would fail if `paid_date`
were left stale after reopening, or never set on marking paid.
"""

import datetime as dt
from decimal import Decimal

from app import crud, schemas


def _create_invoice(db_session):
    draft = crud.create_draft(
        db_session,
        schemas.InvoiceCreate(
            date="2026-02-01",
            client_name="Status Client",
            items=[schemas.InvoiceItemIn(description="Shoot", qty=Decimal("1"), price=Decimal("250"))],
        ),
    )
    return crud.issue_invoice(db_session, draft)


def test_new_invoice_starts_open_with_no_paid_date(db_session):
    invoice = _create_invoice(db_session)
    assert invoice.status == "offen"
    assert invoice.paid_date is None


def test_marking_paid_sets_status_and_todays_paid_date(db_session):
    invoice = _create_invoice(db_session)
    updated = crud.set_invoice_status(db_session, invoice, "bezahlt")

    assert updated.status == "bezahlt"
    assert updated.paid_date == dt.date.today()


def test_reopening_clears_the_paid_date(db_session):
    """Would fail if `paid_date` were left set after reopening — a stale
    paid date on an "offen" invoice is exactly the kind of inconsistency
    this pairing exists to prevent.
    """
    invoice = _create_invoice(db_session)
    crud.set_invoice_status(db_session, invoice, "bezahlt")
    assert invoice.paid_date is not None

    reopened = crud.set_invoice_status(db_session, invoice, "offen")

    assert reopened.status == "offen"
    assert reopened.paid_date is None


def test_paid_date_updates_if_marked_paid_again_later(db_session):
    """Re-marking an already-paid invoice as paid again still (re)sets
    `paid_date` to today, rather than leaving whatever was there before.
    """
    invoice = _create_invoice(db_session)
    crud.set_invoice_status(db_session, invoice, "bezahlt")
    crud.set_invoice_status(db_session, invoice, "offen")
    re_marked = crud.set_invoice_status(db_session, invoice, "bezahlt")

    assert re_marked.status == "bezahlt"
    assert re_marked.paid_date == dt.date.today()


def test_mark_paid_route_persists_paid_date(client):
    """Route-level: `POST /api/invoices/{id}/mark-paid` round-trips the
    same paid_date behavior through the HTTP layer.
    """
    create_resp = client.post(
        "/api/invoices",
        json={
            "date": "2026-02-01",
            "client_name": "Status Client",
            "items": [{"description": "Shoot", "qty": "1", "price": "250.00"}],
        },
    )
    invoice_id = create_resp.json()["id"]

    mark_paid_resp = client.post(f"/api/invoices/{invoice_id}/mark-paid")
    assert mark_paid_resp.status_code == 200
    assert mark_paid_resp.json()["paid_date"] == dt.date.today().isoformat()

    mark_open_resp = client.post(f"/api/invoices/{invoice_id}/mark-open")
    assert mark_open_resp.status_code == 200
    assert mark_open_resp.json()["paid_date"] is None
