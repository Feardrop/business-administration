"""Plain functions doing the actual DB work, kept separate from the
FastAPI route handlers so the logic is easy to unit test on its own.
"""

import datetime as dt
from decimal import Decimal

from sqlalchemy import extract, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas

# Defensive cap on issue_invoice's retry-on-collision loop (see there) -
# comfortably above any realistic burst of concurrent requests for this
# single-user, low-volume app, so it never fires in practice.
_MAX_CREATE_ATTEMPTS = 25


def get_settings(db: Session) -> models.Settings:
    settings = db.get(models.Settings, 1)
    if settings is None:
        settings = models.Settings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def update_settings(db: Session, data: schemas.SettingsSchema) -> models.Settings:
    settings = get_settings(db)
    for field, value in data.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


def _next_invoice_number(db: Session, settings: models.Settings) -> tuple[int, str]:
    """Compute the next (sequence, formatted number) pair for a new invoice.

    Takes MAX(sequence) + 1 among this year's invoices rather than
    COUNT(*), so a deleted invoice (from the middle or the end of the
    series) never causes the next number to collide with or reuse an
    existing one - COUNT shifts down on delete, MAX doesn't.

    "This year's invoices" is a real predicate on `created_at` (the
    invoice's creation timestamp, which is what `year` itself comes
    from) rather than a `LIKE` match against the formatted `number`
    string - a numeric `invoice_prefix` (e.g. "2026") can make an
    unrelated invoice's number contain the current year's digits purely
    by coincidence, which a substring match would wrongly count.
    """
    # `func.max()` ignores NULL sequence values, so drafts (sequence=None,
    # per issue #25) are automatically excluded from the aggregate — an
    # abandoned/deleted draft never had a sequence assigned, so it never
    # consumes a slot (GoBD forbids gaps in issued invoice numbers). No
    # separate "has a number" filter is needed alongside this.
    year = dt.date.today().year
    max_sequence = (
        db.query(func.max(models.Invoice.sequence))
        .filter(extract("year", models.Invoice.created_at) == year)
        .scalar()
    )
    sequence = (max_sequence or 0) + 1
    prefix = f"{settings.invoice_prefix}-" if settings.invoice_prefix else ""
    return sequence, f"{prefix}{year}-{sequence:03d}"


def list_invoices(db: Session):
    return db.query(models.Invoice).order_by(models.Invoice.date.desc()).all()


def get_invoice(db: Session, invoice_id: int):
    return db.get(models.Invoice, invoice_id)


def create_draft(db: Session, data: schemas.InvoiceCreate) -> models.Invoice:
    """Create a new invoice as an editable, numberless draft.

    No number/sequence is assigned and no settings are snapshotted here —
    that only happens at issue time (see `issue_invoice`), so an abandoned
    draft never burns a number or locks in a since-changed setting.
    """
    invoice = models.Invoice(
        number=None,
        sequence=None,
        date=data.date,
        client_name=data.client_name,
        client_address=data.client_address,
        is_kleinunternehmer=None,
        vat_rate=data.vat_rate,
        note=data.note,
        status="draft",
        items=[models.InvoiceItem(description=i.description, qty=i.qty, price=i.price) for i in data.items],
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def update_invoice_draft(db: Session, invoice: models.Invoice, data: schemas.InvoiceUpdate) -> models.Invoice:
    """Apply a partial update to a draft. Caller must ensure it's a draft."""
    update_data = data.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    for field, value in update_data.items():
        setattr(invoice, field, value)
    if items_data is not None:
        invoice.items = [models.InvoiceItem(**item) for item in items_data]
    db.commit()
    db.refresh(invoice)
    return invoice


def issue_invoice(db: Session, invoice: models.Invoice) -> models.Invoice:
    """The one-way draft -> offen transition: assign the number, snapshot
    settings, stamp the issue date, and lock the record.

    Caller must ensure `invoice` is currently a draft.

    Number assignment and the commit happen in the same attempt, guarded by
    a retry-on-IntegrityError loop: two (or more) near-simultaneous issues
    can all read the same MAX(sequence) before any of them commits, so more
    than one can try to write the same number. Whichever commits first
    wins; everyone else gets a UNIQUE-constraint IntegrityError and must
    recompute against the now-committed row(s) that won. `_MAX_CREATE_ATTEMPTS`
    is a generous cap purely to fail loudly instead of looping forever if
    something is genuinely wrong.
    """
    settings = get_settings(db)

    # `db.rollback()` on a collision expires every attribute on `invoice`
    # (it's still the same session-managed instance the caller passed in),
    # so all of these are re-applied on every attempt rather than once
    # up front - otherwise a retry would commit with the expired, reloaded
    # ("draft") values for everything except sequence/number.
    last_error: IntegrityError | None = None
    for _attempt in range(_MAX_CREATE_ATTEMPTS):
        invoice.is_kleinunternehmer = settings.kleinunternehmer
        invoice.vat_rate = Decimal("0") if settings.kleinunternehmer else invoice.vat_rate  # ty: ignore[invalid-assignment]
        invoice.issued_at = dt.date.today()  # ty: ignore[invalid-assignment]
        invoice.status = "offen"  # ty: ignore[invalid-assignment]
        invoice.sequence, invoice.number = _next_invoice_number(db, settings)  # ty: ignore[invalid-assignment]
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            last_error = exc
            continue
        db.refresh(invoice)
        return invoice
    assert last_error is not None  # pragma: no cover - loop always sets it before exhausting
    raise last_error


def set_invoice_status(db: Session, invoice: models.Invoice, status: str) -> models.Invoice:
    invoice.status = status  # ty: ignore[invalid-assignment]  # legacy Column() style, see AGENTS.md
    invoice.paid_date = dt.date.today() if status == "bezahlt" else None  # ty: ignore[invalid-assignment]
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_invoice(db: Session, invoice: models.Invoice) -> None:
    db.delete(invoice)
    db.commit()


def list_expenses(db: Session, year: int | None = None):
    q = db.query(models.Expense)
    if year is not None:
        q = q.filter(extract("year", models.Expense.date) == year)
    return q.order_by(models.Expense.date.desc()).all()


def create_expense(db: Session, data: schemas.ExpenseCreate) -> models.Expense:
    expense = models.Expense(**data.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def update_expense(db: Session, expense: models.Expense, data: schemas.ExpenseUpdate) -> models.Expense:
    """Update only the provided fields of an expense."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, expense: models.Expense) -> None:
    db.delete(expense)
    db.commit()
