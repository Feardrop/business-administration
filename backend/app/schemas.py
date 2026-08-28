"""Pydantic request/response schemas.

Amounts are typed as `Decimal` so FastAPI validates and serializes them
with exact precision (matching the Numeric columns in models.py) instead
of silently going through binary floats.
"""
import datetime as dt
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class SettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    business_name: str = ""
    owner_name: str = ""
    address: str = ""
    tax_number: str = ""
    iban: str = ""
    kleinunternehmer: bool = True
    prev_year_revenue: Decimal = Decimal("0")
    invoice_prefix: str = ""


class InvoiceItemIn(BaseModel):
    description: str
    qty: Decimal
    price: Decimal


class InvoiceItemOut(InvoiceItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class InvoiceCreate(BaseModel):
    date: dt.date
    client_name: str
    client_address: str = ""
    vat_rate: Decimal = Decimal("0")
    note: str = ""
    items: List[InvoiceItemIn]


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    date: dt.date
    client_name: str
    client_address: str
    is_kleinunternehmer: bool
    vat_rate: Decimal
    note: str
    status: Literal["offen", "bezahlt"]
    paid_date: Optional[dt.date]
    created_at: dt.datetime
    items: List[InvoiceItemOut]


class ExpenseCreate(BaseModel):
    date: dt.date
    category: str
    description: str
    amount: Decimal


class ExpenseOut(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
