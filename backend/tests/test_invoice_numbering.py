"""Regression coverage for invoice number generation (issue #10).

`crud._next_invoice_number` used to derive the next number from
`COUNT(*)` of invoices whose `number` contained the current year as a
substring. That breaks in several ways, each covered by a test below:

1. Deleting an invoice from the middle of a year's series shifts the
   count down, so the next created invoice recomputes a number that
   already exists on a surviving row -> UNIQUE constraint violation.
   (Deleting the *newest* invoice instead silently reuses its number,
   which is a GoBD Sec 14 Abs.4 Nr.4 UStG violation - numbers must stay
   unique and gapless for the business's lifetime.)
"""

from decimal import Decimal

from app import crud, schemas


def _make_invoice(db, client_name="Client"):
    return crud.create_invoice(
        db,
        schemas.InvoiceCreate(
            date="2026-01-15",
            client_name=client_name,
            items=[schemas.InvoiceItemIn(description="Shoot", qty=Decimal("1"), price=Decimal("100"))],
        ),
    )


def test_delete_middle_then_create_reuses_no_number(db_session):
    first = _make_invoice(db_session, "First")
    middle = _make_invoice(db_session, "Middle")
    last = _make_invoice(db_session, "Last")

    used_numbers = {first.number, middle.number, last.number}

    crud.delete_invoice(db_session, middle)

    fourth = _make_invoice(db_session, "Fourth")

    assert fourth.number not in used_numbers
