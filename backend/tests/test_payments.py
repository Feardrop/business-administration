"""Tests for issue #30: replacing the boolean `Invoice.paid_date` toggle
with a real payment ledger, so partial payments and cash-basis tax-year
attribution (Zufluss-Prinzip) both work correctly.

These map to issue #30's TDD sequence (backend-owned steps; the
year-boundary income-attribution test (step 6) and the "open" balance
using the remaining amount due (step 9) live in
frontend/src/utils.test.ts instead, since revenue/threshold aggregation
is purely client-side in this app -- see test_invoice_cancellation.py's
note on the same point for issue #26):

1. test_record_payment_creates_row
2. test_status_derives_full_payment_marks_paid
3. test_status_derives_partial_payment
5. test_payment_date_defaults_to_today_but_is_overridable
7. test_overpayment_is_flagged
8. test_migration_converts_paid_date_to_single_payment
10. test_cancelled_invoice_status_not_derived_from_payments
"""

import datetime as dt
from decimal import Decimal

from app import models


def _create_payload(**overrides):
    payload = {
        "date": "2026-01-15",
        "client_name": "Test Client",
        "service_date": "2026-01-15",
        "items": [{"description": "Shoot", "qty": "1", "price": "100.00"}],
    }
    payload.update(overrides)
    return payload


def _make_settings(client, kleinunternehmer=True, **overrides):
    payload = {
        "business_name": "Test Studio",
        "address": "Teststr. 1\n12345 Teststadt",
        "tax_number": "DE123456789",
        "kleinunternehmer": kleinunternehmer,
    }
    payload.update(overrides)
    resp = client.put("/api/settings", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _issued_invoice(client, **overrides):
    """A Kleinunternehmer invoice (no VAT, gross == net == 100.00) issued
    and ready to receive payments.
    """
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload(**overrides)).json()
    return client.post(f"/api/invoices/{created['id']}/issue").json()


def test_record_payment_creates_row(client):
    issued = _issued_invoice(client)

    resp = client.post(
        f"/api/invoices/{issued['id']}/payments", json={"amount": "40.00", "method": "bank_transfer"}
    )

    assert resp.status_code == 201
    body = resp.json()
    assert len(body["payments"]) == 1
    payment = body["payments"][0]
    assert payment["invoice_id"] == issued["id"]
    assert Decimal(payment["amount"]) == Decimal("40.00")
    assert payment["method"] == "bank_transfer"

    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert len(refetched["payments"]) == 1
    assert refetched["payments"][0]["id"] == payment["id"]


def test_status_derives_full_payment_marks_paid(client):
    issued = _issued_invoice(client)
    assert issued["status"] == "offen"

    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "100.00"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "bezahlt"
    assert Decimal(body["amount_paid"]) == Decimal("100.00")
    assert Decimal(body["amount_due"]) == Decimal("0.00")
    assert body["overpaid"] is False


def test_status_derives_partial_payment(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "40.00"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "teilweise bezahlt"
    assert Decimal(body["amount_paid"]) == Decimal("40.00")
    assert Decimal(body["amount_due"]) == Decimal("60.00")


def test_multiple_partial_payments_accumulate_to_paid(client):
    issued = _issued_invoice(client)

    client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "40.00"})
    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "60.00"})

    body = resp.json()
    assert body["status"] == "bezahlt"
    assert len(body["payments"]) == 2
    assert Decimal(body["amount_paid"]) == Decimal("100.00")


def test_payment_date_defaults_to_today_but_is_overridable(client):
    issued = _issued_invoice(client)

    no_date_resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "10.00"})
    assert no_date_resp.json()["payments"][0]["date"] == dt.date.today().isoformat()

    past_date_resp = client.post(
        f"/api/invoices/{issued['id']}/payments", json={"amount": "20.00", "date": "2025-12-31"}
    )
    payments = past_date_resp.json()["payments"]
    backdated = next(p for p in payments if Decimal(p["amount"]) == Decimal("20.00"))
    assert backdated["date"] == "2025-12-31"


def test_overpayment_is_flagged(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "150.00"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "bezahlt"
    assert body["overpaid"] is True
    # amount_due is floored at 0, never negative -- overpaid is the signal.
    assert Decimal(body["amount_due"]) == Decimal("0.00")


def test_deleting_a_payment_recomputes_status_downward(client):
    issued = _issued_invoice(client)
    full = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "100.00"}).json()
    assert full["status"] == "bezahlt"
    payment_id = full["payments"][0]["id"]

    resp = client.delete(f"/api/invoices/{issued['id']}/payments/{payment_id}")

    assert resp.status_code == 204
    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["status"] == "offen"
    assert refetched["payments"] == []


def test_cancelled_invoice_status_not_derived_from_payments(client):
    """Issue #30, TDD step 10: "storniert" is terminal and must never be
    re-derived from payment state, in either direction.
    """
    issued = _issued_invoice(client)
    partial = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "40.00"}).json()
    assert partial["status"] == "teilweise bezahlt"
    payment_id = partial["payments"][0]["id"]

    cancel_resp = client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Auftrag storniert"})
    assert cancel_resp.status_code == 201
    cancelled = client.get(f"/api/invoices/{issued['id']}").json()
    assert cancelled["status"] == "storniert"

    # Removing the (now moot) payment must not flip status back to
    # "offen"/"teilweise bezahlt" -- storniert stays storniert.
    del_resp = client.delete(f"/api/invoices/{issued['id']}/payments/{payment_id}")
    assert del_resp.status_code == 204
    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["status"] == "storniert"


def test_cannot_record_payment_on_cancelled_invoice(client):
    issued = _issued_invoice(client)
    client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Auftrag storniert"})

    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "10.00"})

    assert resp.status_code == 409


def test_cannot_record_payment_on_draft(client):
    _make_settings(client)
    draft = client.post("/api/invoices", json=_create_payload()).json()

    resp = client.post(f"/api/invoices/{draft['id']}/payments", json={"amount": "10.00"})

    assert resp.status_code == 409


def test_delete_payment_returns_404_for_wrong_invoice(client):
    a = _issued_invoice(client, client_name="A")
    b = _issued_invoice(client, client_name="B")
    payment = client.post(f"/api/invoices/{a['id']}/payments", json={"amount": "10.00"}).json()["payments"][0]

    resp = client.delete(f"/api/invoices/{b['id']}/payments/{payment['id']}")

    assert resp.status_code == 404


def test_payment_amount_must_be_positive(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "0.00"})
    assert resp.status_code == 422

    resp_negative = client.post(f"/api/invoices/{issued['id']}/payments", json={"amount": "-5.00"})
    assert resp_negative.status_code == 422


def test_existing_invoices_without_payments_default_to_empty_ledger(db_session):
    """A row seeded the old way (no payments at all) must serialize with
    an empty payment list and zero amount_paid, not error out.
    """
    invoice = models.Invoice(
        number="2025-001",
        date=dt.date(2025, 6, 1),
        client_name="Legacy Client",
        is_kleinunternehmer=True,
        status="offen",
        items=[
            models.InvoiceItem(description="Shoot", qty=1, price=Decimal("100.00"), vat_rate=Decimal("0"))
        ],
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    assert invoice.payments == []
    assert invoice.amount_paid == Decimal("0")
    assert invoice.amount_due == Decimal("100.00")
    assert invoice.overpaid is False
