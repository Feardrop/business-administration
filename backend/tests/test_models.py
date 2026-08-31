"""Regression tests for models and timestamp handling.

Specifically tests for issue #14: naive-UTC timestamp columns that were
previously using the deprecated datetime.utcnow().
"""

import datetime as dt
import warnings
from decimal import Decimal

from app import crud, schemas
from app.models import Invoice


def test_invoice_created_at_no_deprecation_warning(db_session):
    """Verify that creating an Invoice doesn't raise DeprecationWarning.

    Regression test for issue #14: datetime.utcnow() is deprecated in
    Python 3.12+. The fix uses dt.datetime.now(dt.UTC).replace(tzinfo=None)
    instead, which should raise no warnings.
    """
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        crud.create_invoice(
            db_session,
            schemas.InvoiceCreate(
                date="2026-01-15",
                client_name="Test Client",
                items=[
                    schemas.InvoiceItemIn(
                        description="Test Item",
                        qty=Decimal("1"),
                        price=Decimal("100.00"),
                    )
                ],
            ),
        )
        db_session.flush()

        # Check no DeprecationWarning was raised
        deprecation_warnings = [warning for warning in w if issubclass(warning.category, DeprecationWarning)]
        assert len(deprecation_warnings) == 0, f"Unexpected DeprecationWarning(s): {deprecation_warnings}"


def test_invoice_created_at_is_naive_utc(db_session):
    """Verify that Invoice.created_at stores naive-UTC datetime.

    Regression test for issue #14: The column uses naive UTC (no tzinfo) for
    SQLite compatibility, since SQLite doesn't persist timezone information.
    """
    before = dt.datetime.now(dt.UTC).replace(tzinfo=None)
    invoice = crud.create_invoice(
        db_session,
        schemas.InvoiceCreate(
            date="2026-01-15",
            client_name="Test Client",
            items=[
                schemas.InvoiceItemIn(
                    description="Test Item",
                    qty=Decimal("1"),
                    price=Decimal("100.00"),
                )
            ],
        ),
    )
    after = dt.datetime.now(dt.UTC).replace(tzinfo=None)

    # created_at should be naive (no tzinfo)
    assert invoice.created_at.tzinfo is None, "created_at should be naive (no tzinfo)"

    # created_at should be within a reasonable range of now
    assert before <= invoice.created_at <= after, (
        f"created_at {invoice.created_at} not between {before} and {after}"
    )


def test_invoice_created_at_persistence(db_session):
    """Verify that Invoice.created_at persists correctly to the database.

    Regression test for issue #14: Ensure that existing rows read back with
    the same naive-UTC value (no accidental format change or timezone shift).
    """
    invoice = crud.create_invoice(
        db_session,
        schemas.InvoiceCreate(
            date="2026-01-15",
            client_name="Test Client",
            items=[
                schemas.InvoiceItemIn(
                    description="Test Item",
                    qty=Decimal("1"),
                    price=Decimal("100.00"),
                )
            ],
        ),
    )
    original_created_at = invoice.created_at
    db_session.commit()

    # Query back from the database
    fetched = db_session.query(Invoice).filter_by(id=invoice.id).one()
    assert fetched.created_at == original_created_at, "created_at should persist unchanged"
    assert fetched.created_at.tzinfo is None, "fetched created_at should still be naive"
