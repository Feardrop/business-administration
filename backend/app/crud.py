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

# Gross-total threshold (in euros) under which §33 UStDV's
# "Kleinbetragsrechnung" reduced requirements apply — see
# _missing_issue_fields below and issue #33.
KLEINBETRAGSRECHNUNG_THRESHOLD = Decimal("250")


class InvoiceIssueValidationError(Exception):
    """Raised by `issue_invoice` when a draft is missing one or more of the
    §14 Abs. 4 UStG mandatory invoice fields.

    `missing` is the *complete* list of human-readable (German) messages
    naming exactly what's missing — every requirement is checked before
    raising, not just the first one found, so a caller can show the whole
    checklist in one shot rather than making the user fix issues one at a
    time. `routers/invoices.py` surfaces this as a 422 with
    `{"message": ..., "missing_fields": [...]}`.
    """

    def __init__(self, missing: list[str]):
        self.missing = missing
        message = "Rechnung kann nicht ausgestellt werden – Pflichtangaben fehlen: " + ", ".join(missing)
        super().__init__(message)


def _invoice_gross_total(invoice: models.Invoice, kleinunternehmer: bool) -> Decimal:
    """The gross total an invoice will have once issued, given whether the
    Kleinunternehmer exemption applies — used only to decide whether the
    §33 UStDV Kleinbetragsrechnung threshold kicks in (see
    `_missing_issue_fields`), not as a general-purpose totals API (the
    frontend's `invoiceTotals` in utils.ts owns display-side totals).
    """
    total = Decimal("0")
    for item in invoice.items:
        net = Decimal(item.qty) * Decimal(item.price)
        rate = Decimal("0") if kleinunternehmer else Decimal(item.vat_rate or 0)
        total += net * (Decimal("1") + rate / Decimal("100"))
    return total


def _missing_issue_fields(invoice: models.Invoice, settings: models.Settings) -> list[str]:
    """The §14 Abs. 4 UStG mandatory-field checklist for `issue_invoice`.

    Returns every currently-missing requirement (German, human-readable) —
    empty list means the draft may be issued. `number`, `date`/`issued_at`
    are not checked here: they're always present by construction
    (`_next_invoice_number`/`issue_invoice` assign them unconditionally).
    """
    missing: list[str] = []

    # Supplier details (from Settings) — same fields the dashboard banner
    # in frontend/src/pages/Dashboard.tsx warns about.
    if not (settings.business_name or "").strip():
        missing.append("Firmenname (Einstellungen)")
    if not (settings.address or "").strip():
        missing.append("Anschrift (Einstellungen)")
    if not (settings.tax_number or "").strip() and not (settings.ust_id_nr or "").strip():
        missing.append("Steuernummer oder USt-IdNr (Einstellungen)")

    # Recipient. client_name is already NOT NULL at the DB/schema level, but
    # nothing stops it being blank/whitespace, so check defensively.
    if not (invoice.client_name or "").strip():
        missing.append("Kunde – Name")
    # client_address is only mandatory above the Kleinbetragsrechnung
    # threshold (§33 UStDV) — under it, the reduced requirements apply and
    # the recipient's address may be omitted (though nothing stops the user
    # from including it anyway).
    gross = _invoice_gross_total(invoice, bool(settings.kleinunternehmer))
    if gross >= KLEINBETRAGSRECHNUNG_THRESHOLD and not (invoice.client_address or "").strip():
        missing.append("Kunde – Anschrift (ab 250 € Gesamtbetrag)")

    # §14 Abs. 4 Nr. 6 UStG: the service date, or — for a period like "shot
    # in August, invoiced in September" — a free-text period suffices.
    if invoice.service_date is None and not (invoice.service_period_text or "").strip():
        missing.append("Leistungsdatum oder Leistungszeitraum")

    if not invoice.items:
        missing.append("Mindestens eine Position")

    return missing


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
        service_date=data.service_date,
        service_period_text=data.service_period_text,
        is_kleinunternehmer=None,
        note=data.note,
        status="draft",
        items=[
            models.InvoiceItem(description=i.description, qty=i.qty, price=i.price, vat_rate=i.vat_rate)
            for i in data.items
        ],
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
    """Assign a number/sequence to a draft and transition it to "offen".

    Caller must ensure `invoice` is currently a draft. Raises
    `InvoiceIssueValidationError` (see `_missing_issue_fields`) instead of
    mutating anything if a mandatory field is absent — issuing is all-or-
    nothing.

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
    missing = _missing_issue_fields(invoice, settings)
    if missing:
        raise InvoiceIssueValidationError(missing)

    # `db.rollback()` on a collision expires every attribute on `invoice`
    # (it's still the same session-managed instance the caller passed in),
    # so all of these are re-applied on every attempt rather than once
    # up front - otherwise a retry would commit with the expired, reloaded
    # ("draft") values for everything except sequence/number.
    last_error: IntegrityError | None = None
    for _attempt in range(_MAX_CREATE_ATTEMPTS):
        invoice.is_kleinunternehmer = settings.kleinunternehmer
        if settings.kleinunternehmer:
            # Zero every line's vat_rate, the same way this used to zero the
            # single invoice-level vat_rate — is_kleinunternehmer already
            # gates display, but this keeps the stored rate consistent with
            # reality.
            for item in invoice.items:
                item.vat_rate = Decimal("0")
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


def cancel_invoice(db: Session, invoice: models.Invoice, reason: str) -> models.Invoice:
    """Reverse an issued invoice with a Stornorechnung (cancellation
    invoice) instead of deleting or silently editing it — §14c UStG treats
    an issued invoice as a legal document that can only be undone by a
    formal, separately-numbered counter-document.

    Caller must ensure `invoice.status` is "offen" or "bezahlt" (not
    "draft" — those are just deleted — and not already "storniert").

    In one transaction: marks `invoice` itself as "storniert"
    (`cancelled_at`/`cancel_reason`), and creates + issues a brand-new
    Invoice whose items are copies of `invoice`'s with `qty` negated
    (`price` and `vat_rate` unchanged — issue #33 established `vat_rate`
    as a per-line property independent of the amount's sign, and negating
    only `qty` keeps the per-unit price recognizable as "the same price,
    reversed" on the printed document). The cancellation invoice is routed
    through `issue_invoice`, so it gets its own real sequential number and
    its own §14 UStG validation/is_kleinunternehmer snapshot, taken as of
    *today* (not copied from the original) since it is a new legal
    document in its own right — a real counter-invoice, not a flag on the
    original.

    Wiring an audit-log entry for this later is meant to be a one-line
    addition here (that epic doesn't exist yet in this codebase) — keep
    this the single function everything routes through.

    Note for issue #30 (partial payments): "storniert" is a terminal
    status that must NOT be re-derived from payment state. When #30 adds
    payment-derived status computation (offen/teilweise
    bezahlt/bezahlt), it must check for "storniert" first and
    short-circuit — a cancelled invoice's (now moot) payment records must
    never recompute it back into "offen"/"teilweise bezahlt".
    """
    invoice.status = "storniert"  # ty: ignore[invalid-assignment]
    invoice.cancelled_at = dt.date.today()  # ty: ignore[invalid-assignment]
    invoice.cancel_reason = reason  # ty: ignore[invalid-assignment]

    cancellation = models.Invoice(
        number=None,
        date=dt.date.today(),
        client_name=invoice.client_name,
        client_address=invoice.client_address,
        service_date=invoice.service_date,
        service_period_text=invoice.service_period_text,
        is_kleinunternehmer=None,
        note=f"Storno zu Rechnung {invoice.number}",
        status="draft",
        cancels_invoice_id=invoice.id,
        items=[
            models.InvoiceItem(description=i.description, qty=-i.qty, price=i.price, vat_rate=i.vat_rate)
            for i in invoice.items
        ],
    )
    db.add(cancellation)
    return issue_invoice(db, cancellation)


def cancel_and_correct(
    db: Session, invoice: models.Invoice, reason: str
) -> tuple[models.Invoice, models.Invoice]:
    """`cancel_invoice`, plus a fresh editable draft pre-filled from the
    original — for the common real-world case where an invoice was wrong
    and needs to be reissued with corrections, not just reversed.

    Returns `(cancellation_invoice, new_draft)`. The draft is created via
    `create_draft` (same as any other draft): numberless, no settings
    snapshotted, freely editable, and not itself linked to the original via
    `cancels_invoice_id` (only the cancellation invoice is a formal
    counter-document; the draft is just a convenience starting point).
    """
    cancellation = cancel_invoice(db, invoice, reason)

    draft_data = schemas.InvoiceCreate(
        date=dt.date.today(),
        client_name=invoice.client_name,  # ty: ignore[invalid-argument-type]  # legacy Column() style, see AGENTS.md
        client_address=invoice.client_address,  # ty: ignore[invalid-argument-type]
        service_date=invoice.service_date,  # ty: ignore[invalid-argument-type]
        service_period_text=invoice.service_period_text,  # ty: ignore[invalid-argument-type]
        note="",
        items=[
            schemas.InvoiceItemIn(description=i.description, qty=i.qty, price=i.price, vat_rate=i.vat_rate)
            for i in invoice.items
        ],
    )
    draft = create_draft(db, draft_data)
    return cancellation, draft


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
