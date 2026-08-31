"""Coverage for `crud._next_invoice_number` (issue #17).

This is a backfill against existing, unmodified behavior: `_next_invoice_number`
already worked correctly before this test file was added. Each test is
written so it would fail if the corresponding behavior broke (see the
docstrings), not just to pad coverage.

Note on approach: these tests deliberately do NOT monkeypatch
`datetime.date.today()` to simulate a year change. SQLAlchemy caches each
compiled statement's bind processors on the (long-lived, module-level)
engine; the SQLite `Date` type's processor closes over `datetime.date` at
first-compile time to build its `isinstance()` check. Swapping in a fake
`date` subclass for one test works for that test alone, but the *next* test
in the same run can hit a stale cached processor built against a different
(sibling) fake subclass and fail an unrelated `isinstance` check — a subtle
trap, not a real bug in `_next_invoice_number` itself. Instead, "year
rollover" is exercised by planting an invoice numbered for a different year
directly via the ORM model (bypassing `_next_invoice_number`) and asserting
today's real invoices are counted independently of it — which is exactly the
property that makes a rollover work when the real clock crosses Jan 1.
"""

import datetime as dt
from decimal import Decimal

from app import crud, models, schemas


def _make_invoice(db_session, **overrides) -> models.Invoice:
    kwargs = {
        "date": dt.date.today(),
        "client_name": "Test Client",
        "items": [schemas.InvoiceItemIn(description="Shoot", qty=Decimal("1"), price=Decimal("100"))],
    }
    kwargs.update(overrides)
    return crud.create_invoice(db_session, schemas.InvoiceCreate(**kwargs))


def _insert_raw_invoice(db_session, number: str) -> models.Invoice:
    """Insert an invoice row directly, bypassing `_next_invoice_number`.

    Used to plant an invoice "from another year" without needing to control
    what `dt.date.today()` returns.
    """
    invoice = models.Invoice(
        number=number,
        date=dt.date.today(),
        client_name="Legacy Client",
        is_kleinunternehmer=True,
        vat_rate=Decimal("0"),
        status="offen",
    )
    db_session.add(invoice)
    db_session.commit()
    return invoice


def test_sequence_increments_within_the_same_year(db_session):
    """Three invoices in a row get strictly increasing running numbers.

    Would fail if `_next_invoice_number` stopped incrementing off the count
    of existing invoices for the year (e.g. hardcoded to 1, or off-by-one).
    """
    first = _make_invoice(db_session)
    second = _make_invoice(db_session)
    third = _make_invoice(db_session)

    n1, n2, n3 = (int(inv.number.rsplit("-", 1)[1]) for inv in (first, second, third))
    assert n2 == n1 + 1
    assert n3 == n2 + 1


def test_prefix_is_prepended_when_set(db_session):
    """A configured `invoice_prefix` lands at the front of the number.

    Would fail if the prefix were dropped or misplaced.
    """
    crud.update_settings(db_session, schemas.SettingsSchema(invoice_prefix="FOTO"))
    invoice = _make_invoice(db_session)

    year = dt.date.today().year
    assert invoice.number.startswith(f"FOTO-{year}-")


def test_no_prefix_omits_leading_separator(db_session):
    """With no prefix configured the number starts directly with the year.

    Guards against a stray leading "-" when `invoice_prefix` is empty.
    """
    invoice = _make_invoice(db_session)
    year = dt.date.today().year
    assert invoice.number == f"{year}-001"


def test_year_scoped_count_ignores_other_years(db_session):
    """A different year's invoices must not inflate this year's count.

    Plants five invoices numbered for a year far in the past directly via
    the model (bypassing `_next_invoice_number`) and confirms the next real
    invoice still starts this year's sequence at 001 — i.e. the `LIKE
    "%<year>%"` filter in `_next_invoice_number` is actually year-scoped,
    not a count of all invoices ever issued. This is the same mechanism
    that makes numbering reset when the real calendar year rolls over.
    Would fail if the filter were dropped (e.g. `db.query(Invoice).count()`).
    """
    for i in range(1, 6):
        _insert_raw_invoice(db_session, number=f"1999-{i:03d}")

    invoice = _make_invoice(db_session)
    year = dt.date.today().year
    assert invoice.number == f"{year}-001"


def test_year_scoped_count_still_counts_matching_year(db_session):
    """Sanity check that the counter does pick up same-year invoices.

    Complements the isolation test above: proves the filter matches the
    current year's own invoices, so the previous test isn't passing simply
    because the filter matches nothing at all.
    """
    year = dt.date.today().year
    _insert_raw_invoice(db_session, number=f"{year}-777")

    invoice = _make_invoice(db_session)
    # `_next_invoice_number` counts matching rows rather than parsing the
    # highest existing suffix, so one same-year row bumps the count to 2
    # regardless of what number that row itself carries.
    assert invoice.number == f"{year}-002"
