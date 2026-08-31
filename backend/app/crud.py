"""Plain functions doing the actual DB work, kept separate from the
FastAPI route handlers so the logic is easy to unit test on its own.
"""

import datetime as dt
from decimal import Decimal

from sqlalchemy import extract, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas

# Defensive cap on create_invoice's retry-on-collision loop (see there) -
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


def create_invoice(db: Session, data: schemas.InvoiceCreate) -> models.Invoice:
    settings = get_settings(db)

    # Number assignment and the insert happen in the same attempt, guarded
    # by a retry-on-IntegrityError loop: two (or more) near-simultaneous
    # creates can all read the same MAX(sequence) before any of them
    # commits, so more than one can try to insert the same number.
    # Whichever commits first wins; everyone else gets a UNIQUE-constraint
    # IntegrityError and must recompute against the now-committed row(s)
    # that won. A single retry only covers a two-way collision - a bigger
    # burst of concurrent requests can still collide on the recomputed
    # number, so this keeps retrying (each time re-reading a fresh
    # MAX(sequence)) rather than surfacing a raw 500 to the caller.
    # `_MAX_CREATE_ATTEMPTS` is a generous cap purely to fail loudly
    # instead of looping forever if something is genuinely wrong.
    last_error: IntegrityError | None = None
    for _attempt in range(_MAX_CREATE_ATTEMPTS):
        sequence, number = _next_invoice_number(db, settings)
        invoice = models.Invoice(
            sequence=sequence,
            number=number,
            date=data.date,
            client_name=data.client_name,
            client_address=data.client_address,
            is_kleinunternehmer=settings.kleinunternehmer,
            vat_rate=Decimal("0") if settings.kleinunternehmer else data.vat_rate,
            note=data.note,
            status="offen",
            items=[
                models.InvoiceItem(description=i.description, qty=i.qty, price=i.price) for i in data.items
            ],
        )
        db.add(invoice)
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
