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
3. Two near-simultaneous creates can both read the same MAX(sequence)
   before either commits, so both compute and try to insert the same
   next number.
"""

import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from app import crud, models, schemas
from app.database import SessionLocal


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


def test_concurrent_create_no_duplicates():
    """~20 near-simultaneous creates must not compute the same next number.

    A plain SQLAlchemy `Session` is not thread-safe, so sharing one
    literal `Session` object across threads (as FastAPI never does - it
    opens one per request via `get_db()`) raises `IllegalStateChangeError`
    for reasons unrelated to the numbering bug. Instead this gives every
    thread its own short-lived session against the same underlying
    database, the same way concurrent HTTP requests would each get their
    own request-scoped session - which is exactly the race
    `_next_invoice_number` needs to survive.
    """
    from app.database import Base, engine

    Base.metadata.create_all(bind=engine)
    try:
        # Pre-create the singleton settings row so every thread's
        # get_settings() call is a plain read - get_settings's own
        # get-or-create race is a separate, pre-existing issue, not the
        # invoice-numbering race this test targets.
        seed = SessionLocal()
        try:
            crud.get_settings(seed)
        finally:
            seed.close()

        def _create(i):
            session = SessionLocal()
            try:
                return _make_invoice(session, f"Client {i}")
            finally:
                session.close()

        n = 20
        with ThreadPoolExecutor(max_workers=n) as pool:
            invoices = list(pool.map(_create, range(n)))

        numbers = [inv.number for inv in invoices]
        assert len(numbers) == len(set(numbers))
    finally:
        Base.metadata.drop_all(bind=engine)
