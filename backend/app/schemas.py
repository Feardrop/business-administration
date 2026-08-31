"""Pydantic request/response schemas.

Amounts are typed as `Decimal` so FastAPI validates and serializes them
with exact precision (matching the Numeric columns in models.py) instead
of silently going through binary floats.
"""

import datetime as dt
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The full target status lifecycle (see models.Invoice's docstring for the
# diagram). Only "draft", "offen" and "bezahlt" are reachable today — this
# codebase does not implement "teilweise bezahlt" (future #30, partial
# payments) or "storniert" (future #26, cancellation) yet. All five are
# listed here up front so InvoiceOut doesn't need a breaking schema change
# when those issues land.
InvoiceStatus = Literal["draft", "offen", "teilweise bezahlt", "bezahlt", "storniert"]


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
    """Payload for creating a draft (`POST /api/invoices`).

    Nothing here is burned: no number is assigned and no settings are
    snapshotted until the draft is issued (`POST
    /api/invoices/{id}/issue`) — see crud.create_draft / crud.issue_invoice.
    `vat_rate` is the rate the user picked in the form; it is kept as-is on
    the draft and only zeroed out at issue time if settings.kleinunternehmer
    is true then.
    """

    date: dt.date
    client_name: str
    client_address: str = ""
    vat_rate: Decimal = Decimal("0")
    note: str = ""
    items: list[InvoiceItemIn]


class InvoiceUpdate(BaseModel):
    """Partial update for a draft (`PATCH /api/invoices/{id}`).

    Every field is optional: only fields explicitly present in the request
    body are applied (see crud.update_invoice_draft's `exclude_unset`
    usage). Restricted to drafts by the router — issued invoices are
    immutable via this route (409).
    """

    date: dt.date | None = None
    client_name: str | None = None
    client_address: str | None = None
    vat_rate: Decimal | None = None
    note: str | None = None
    items: list[InvoiceItemIn] | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None
    date: dt.date
    client_name: str
    client_address: str
    is_kleinunternehmer: bool | None
    vat_rate: Decimal
    note: str
    status: InvoiceStatus
    paid_date: dt.date | None
    issued_at: dt.date | None
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
