from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("", response_model=list[schemas.ExpenseOut])
def read_expenses(year: int | None = None, db: Session = Depends(get_db)):
    return crud.list_expenses(db, year)


@router.post("", response_model=schemas.ExpenseOut, status_code=201)
def create_expense(data: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    return crud.create_expense(db, data)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.get(models.Expense, expense_id)
    if expense is None:
        raise HTTPException(404, "Ausgabe nicht gefunden.")
    crud.delete_expense(db, expense)
