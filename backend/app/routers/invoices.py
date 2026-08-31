from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, schemas
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
    return crud.issue_invoice(db, invoice)


@router.post("/{invoice_id}/mark-paid", response_model=schemas.InvoiceOut)
def mark_paid(invoice_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    return crud.set_invoice_status(db, invoice, "bezahlt")


@router.post("/{invoice_id}/mark-open", response_model=schemas.InvoiceOut)
def mark_open(invoice_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    return crud.set_invoice_status(db, invoice, "offen")


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = _get_or_404(db, invoice_id)
    if invoice.status != "draft":
        raise HTTPException(409, "Nur Entwürfe können gelöscht werden.")
    crud.delete_invoice(db, invoice)
