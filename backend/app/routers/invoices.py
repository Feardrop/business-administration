from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=list[schemas.InvoiceOut])
def read_invoices(db: Session = Depends(get_db)):
    return crud.list_invoices(db)


@router.post("", response_model=schemas.InvoiceOut, status_code=201)
def create_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    if not data.items:
        raise HTTPException(400, "Rechnung braucht mindestens eine Position.")
    return crud.create_draft(db, data)


def _get_or_404(db: Session, invoice_id: int):
    invoice = crud.get_invoice(db, invoice_id)
    if invoice is None:
        raise HTTPException(404, "Rechnung nicht gefunden.")
    return invoice


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def read_invoice(invoice_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, invoice_id)


@router.patch("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: int, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status != "draft":
        raise HTTPException(409, "Nur Entwürfe können bearbeitet werden.")
    return crud.update_invoice_draft(db, invoice, data)


@router.post("/{invoice_id}/issue", response_model=schemas.InvoiceOut)
def issue_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status != "draft":
        raise HTTPException(409, "Nur Entwürfe können ausgestellt werden.")
    try:
        return crud.issue_invoice(db, invoice)
    except crud.InvoiceIssueValidationError as exc:
        # Structured so the frontend (and issue #26, which builds on this
        # shape) can show precisely what's missing rather than a generic
        # "invalid" message.
        raise HTTPException(
            422,
            detail={
                "message": "Rechnung kann nicht ausgestellt werden – Pflichtangaben nach §14 UStG fehlen.",
                "missing_fields": exc.missing,
            },
        ) from exc


_CANCELLABLE_STATUSES = ("offen", "teilweise bezahlt", "bezahlt")


@router.post("/{invoice_id}/cancel", response_model=schemas.InvoiceOut, status_code=201)
def cancel_invoice(invoice_id: int, data: schemas.CancelInvoiceIn, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            409,
            "Nur ausgestellte, noch nicht stornierte Rechnungen können storniert werden.",
        )
    return crud.cancel_invoice(db, invoice, data.reason)


@router.post("/{invoice_id}/cancel-and-correct", response_model=schemas.CancelAndCorrectOut, status_code=201)
def cancel_and_correct_invoice(invoice_id: int, data: schemas.CancelInvoiceIn, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            409,
            "Nur ausgestellte, noch nicht stornierte Rechnungen können storniert werden.",
        )
    cancellation, draft = crud.cancel_and_correct(db, invoice, data.reason)
    return {"cancellation": cancellation, "draft": draft}


# A boolean paid/open toggle doesn't fit a many-payments ledger (issue
# #30) — replaced by a real payment history below. Only an already-issued,
# not-yet-cancelled invoice can receive a payment; "bezahlt" stays
# payable too (a correction, or an intentional overpayment — flagged via
# InvoiceOut.overpaid, never rejected or capped).
_PAYABLE_STATUSES = ("offen", "teilweise bezahlt", "bezahlt")


@router.post("/{invoice_id}/payments", response_model=schemas.InvoiceOut, status_code=201)
def create_payment(invoice_id: int, data: schemas.PaymentIn, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status not in _PAYABLE_STATUSES:
        raise HTTPException(
            409,
            "Zahlungen können nur zu ausgestellten, nicht stornierten Rechnungen erfasst werden.",
        )
    return crud.record_payment(db, invoice, data)


@router.delete("/{invoice_id}/payments/{payment_id}", status_code=204)
def delete_payment(invoice_id: int, payment_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    payment = db.get(models.Payment, payment_id)
    if payment is None or payment.invoice_id != invoice.id:
        raise HTTPException(404, "Zahlung nicht gefunden.")
    crud.delete_payment(db, invoice, payment)


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status != "draft":
        raise HTTPException(409, "Nur Entwürfe können gelöscht werden.")
    crud.delete_invoice(db, invoice)
