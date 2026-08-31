"""Pydantic request/response schemas.

Amounts are typed as `Decimal` so FastAPI validates and serializes them
with exact precision (matching the Numeric columns in models.py) instead
of silently going through binary floats.
"""

import datetime as dt
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    items: list[InvoiceItemIn]


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
    paid_date: dt.date | None
    created_at: dt.datetime
    items: list[InvoiceItemOut]


_VALID_EXPENSE_CATEGORIES = ["equipment", "software", "travel", "insurance", "rent", "training", "other"]


class ExpenseCreate(BaseModel):
    date: dt.date
    category: str
    description: str
    amount: Decimal = Field(gt=0, decimal_places=2)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in _VALID_EXPENSE_CATEGORIES:
            raise ValueError(f"category must be one of {_VALID_EXPENSE_CATEGORIES}")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("description cannot be empty")
        return v


class ExpenseUpdate(BaseModel):
    date: dt.date | None = None
    category: str | None = None
    description: str | None = None
    amount: Decimal | None = Field(None, gt=0, decimal_places=2)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_EXPENSE_CATEGORIES:
            raise ValueError(f"category must be one of {_VALID_EXPENSE_CATEGORIES}")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is not None and (not v or not v.strip()):
            raise ValueError("description cannot be empty")
        return v


class ExpenseOut(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
