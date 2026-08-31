"""Coverage for the `is_kleinunternehmer`/`vat_rate` snapshot behavior on
`Invoice` (issue #17).

AGENTS.md calls this out explicitly as deliberate: an invoice must keep
showing what was actually true at the moment it was issued, even if the
Kleinunternehmer setting is flipped afterwards. This is a backfill against
existing, unmodified behavior — `issue_invoice` already snapshots correctly
— but nothing currently protects it from regressing into a live join against
`settings`, which is exactly what these tests would catch.
"""

import datetime as dt
from decimal import Decimal

from app import crud, schemas


def _create_invoice(db_session, kleinunternehmer, vat_rate=Decimal("19")):
    crud.update_settings(
        db_session,
        schemas.SettingsSchema(
            business_name="Snapshot Studio",
            address="Teststr. 1",
            tax_number="DE123456789",
            kleinunternehmer=kleinunternehmer,
        ),
    )
    draft = crud.create_draft(
        db_session,
        schemas.InvoiceCreate(
            date="2026-03-01",
            client_name="Snapshot Client",
            client_address="Client street 1",
            service_date=dt.date(2026, 3, 1),
            items=[
                schemas.InvoiceItemIn(
                    description="Shoot", qty=Decimal("1"), price=Decimal("500"), vat_rate=vat_rate
                )
            ],
        ),
    )
    return crud.issue_invoice(db_session, draft)


def test_invoice_snapshots_settings_at_creation_time(db_session):
    """A newly created invoice copies the *current* settings values.

    Would fail if `issue_invoice` ignored `settings.kleinunternehmer` or
    the submitted `vat_rate` and used different/default values instead.
    """
    invoice = _create_invoice(db_session, kleinunternehmer=False, vat_rate=Decimal("19"))

    assert invoice.is_kleinunternehmer is False
    assert invoice.items[0].vat_rate == Decimal("19")


def test_kleinunternehmer_invoice_ignores_submitted_vat_rate(db_session):
    """While Kleinunternehmer is active, `vat_rate` is forced to 0.

    Would fail if `issue_invoice` stored the caller-submitted `vat_rate`
    verbatim even when `settings.kleinunternehmer` is True.
    """
    invoice = _create_invoice(db_session, kleinunternehmer=True, vat_rate=Decimal("19"))

    assert invoice.is_kleinunternehmer is True
    assert invoice.items[0].vat_rate == Decimal("0")


def test_flipping_kleinunternehmer_after_creation_does_not_change_past_invoice(db_session):
    """Changing `Settings` after the fact must not alter an issued invoice.

    This is the core regression the AGENTS.md note warns about: if
    `is_kleinunternehmer`/`vat_rate` were ever "fixed" into a live join
    against `settings` instead of a snapshot, this test would catch it —
    the invoice's values would follow the later settings change instead of
    staying frozen at what was true when it was issued.
    """
    invoice = _create_invoice(db_session, kleinunternehmer=False, vat_rate=Decimal("19"))
    invoice_id = invoice.id

    assert invoice.is_kleinunternehmer is False
    assert invoice.items[0].vat_rate == Decimal("19")

    # Flip the setting after the invoice already exists.
    crud.update_settings(
        db_session,
        schemas.SettingsSchema(
            business_name="Snapshot Studio",
            address="Teststr. 1",
            tax_number="DE123456789",
            kleinunternehmer=True,
        ),
    )

    reloaded = crud.get_invoice(db_session, invoice_id)
    assert reloaded.is_kleinunternehmer is False
    assert reloaded.items[0].vat_rate == Decimal("19")


def test_flipping_kleinunternehmer_off_after_creation_does_not_add_vat(db_session):
    """The reverse direction: turning Kleinunternehmer off later doesn't
    retroactively add VAT to an invoice that had none.
    """
    invoice = _create_invoice(db_session, kleinunternehmer=True, vat_rate=Decimal("19"))
    invoice_id = invoice.id

    assert invoice.is_kleinunternehmer is True
    assert invoice.items[0].vat_rate == Decimal("0")

    crud.update_settings(
        db_session,
        schemas.SettingsSchema(
            business_name="Snapshot Studio",
            address="Teststr. 1",
            tax_number="DE123456789",
            kleinunternehmer=False,
        ),
    )

    reloaded = crud.get_invoice(db_session, invoice_id)
    assert reloaded.is_kleinunternehmer is True
    assert reloaded.items[0].vat_rate == Decimal("0")
