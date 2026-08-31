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
2. A numeric `invoice_prefix` (e.g. "2026") can coincide with a past
   year's digits, so an old invoice whose number was built from that
   prefix (but issued in a different year) wrongly matches the current
   year's `LIKE '%<year>%'` filter and inflates the next sequence.
"""

import datetime as dt
from decimal import Decimal

from app import crud, models, schemas


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


def test_numeric_prefix_does_not_inflate_count(db_session):
    current_year = dt.date.today().year
    past_year = current_year - 1

    # A genuinely unrelated invoice from a past year, created back when
    # invoice_prefix happened to be set to a numeral matching *this*
    # year's digits. Its formatted number ("<current_year>-<past_year>-099")
    # legitimately contains the current year as a substring, purely by
    # prefix coincidence - it must not count towards this year's series.
    phantom = models.Invoice(
        sequence=99,
        number=f"{current_year}-{past_year}-099",
        date=dt.date(past_year, 12, 31),
        client_name="Phantom",
        is_kleinunternehmer=True,
        vat_rate=Decimal("0"),
        status="offen",
        created_at=dt.datetime(past_year, 12, 31),
    )
    db_session.add(phantom)
    db_session.commit()

    crud.update_settings(db_session, schemas.SettingsSchema(invoice_prefix=str(current_year)))

    first = _make_invoice(db_session, "First")

    assert first.number.endswith("-001")
