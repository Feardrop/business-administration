from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=schemas.SettingsSchema)
def read_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)


@router.put("", response_model=schemas.SettingsSchema)
def write_settings(data: schemas.SettingsSchema, db: Session = Depends(get_db)):
    return crud.update_settings(db, data)
