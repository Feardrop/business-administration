"""Pydantic request/response schemas.

Amounts are typed as `Decimal` so FastAPI validates and serializes them
with exact precision (matching the Numeric columns in models.py) instead
of silently going through binary floats.
"""

import datetime as dt
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The full status lifecycle (see models.Invoice's docstring for the
# diagram) — all five are reachable now that #26 (cancellation) and #30
# (partial payments) have both landed.
InvoiceStatus = Literal["draft", "offen", "teilweise bezahlt", "bezahlt", "storniert"]


class SettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    business_name: str = ""
    owner_name: str = ""
    address: str = ""
    tax_number: str = ""
    # Umsatzsteuer-Identifikationsnummer, separate from tax_number — many
    # small Kleingewerbe businesses don't have one, so this stays optional
    # and is only printed on the invoice when set (issue #33).
    ust_id_nr: str = ""
    iban: str = ""
    kleinunternehmer: bool = True
    prev_year_revenue: Decimal = Decimal("0")
    invoice_prefix: str = ""


class InvoiceItemIn(BaseModel):
    description: str
    qty: Decimal
    price: Decimal
    # One VAT rate per line (issue #33) — mixing 19%/7% lines on a single
    # invoice is normal for this business. Default matches the old
    # Invoice-level vat_rate column's default (0).
    vat_rate: Decimal = Decimal("0")


class InvoiceItemOut(InvoiceItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class InvoiceCreate(BaseModel):
    """Payload for creating a draft (`POST /api/invoices`).

    Nothing here is burned: no number is assigned and no settings are
    snapshotted until the draft is issued (`POST
    /api/invoices/{id}/issue`) — see crud.create_draft / crud.issue_invoice.
    `vat_rate` lives per-item now (see InvoiceItemIn); it is kept as-is on
    the draft and only zeroed out per item at issue time if
    settings.kleinunternehmer is true then.

    `service_date`/`service_period_text` (§14 Abs. 4 Nr. 6 UStG) are
    optional on a draft but required — at least one of them — before the
    draft can be issued; see crud.issue_invoice's validation. The UI is
    expected to let the user pick only one of the two (an exact date or a
    free-text period), but nothing here enforces mutual exclusivity — if
    both are somehow set, service_date takes priority when printing.
    """

    date: dt.date
    client_name: str
    client_address: str = ""
    service_date: dt.date | None = None
    service_period_text: str | None = None
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
    service_date: dt.date | None = None
    service_period_text: str | None = None
    note: str | None = None
    items: list[InvoiceItemIn] | None = None


class PaymentIn(BaseModel):
    """Payload for `POST /api/invoices/{id}/payments`.

    `date` defaults to today (in `crud.record_payment`) when omitted, but
    is always overridable — this is the actual fix for issue #30's
    cash-basis tax-year attribution bug: German Zufluss-Prinzip attributes
    income to the year money was actually received, not the year it was
    typed into the app (e.g. a December payment entered the following
    March must still count as December income).
    """

    date: dt.date | None = None
    amount: Decimal
    method: str = ""
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Zahlungsbetrag muss größer als 0 sein.")
        return v


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    date: dt.date
    amount: Decimal
    method: str
    note: str | None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None
    date: dt.date
    client_name: str
    client_address: str
    service_date: dt.date | None
    service_period_text: str | None
    is_kleinunternehmer: bool | None
    note: str
    status: InvoiceStatus
    issued_at: dt.date | None
    created_at: dt.datetime
    # Set together with status="storniert" by crud.cancel_invoice. Null on
    # every invoice that has never been cancelled (issue #26).
    cancelled_at: dt.date | None
    cancel_reason: str | None
    # Set only on a cancellation invoice itself (points at the invoice it
    # cancels). Null everywhere else, including on the cancelled original.
    cancels_invoice_id: int | None
    # The reverse link: set on the cancelled original once a cancellation
    # invoice exists for it (points at that cancellation invoice). Null
    # otherwise, including on a cancellation invoice itself.
    cancellation_invoice_id: int | None
    items: list[InvoiceItemOut]
    # The payment ledger (issue #30), replacing the old boolean paid_date.
    # amount_paid/amount_due/overpaid are computed properties on
    # models.Invoice (see there) — amount_due is floored at 0, so check
    # `overpaid` rather than a negative amount_due to detect one.
    payments: list[PaymentOut]
    amount_paid: Decimal
    amount_due: Decimal
    overpaid: bool


_VALID_EXPENSE_CATEGORIES = ["equipment", "software", "travel", "insurance", "rent", "training", "other"]


class CancelInvoiceIn(BaseModel):
    """Payload for `POST /invoices/{id}/cancel` and `.../cancel-and-correct`.

    §14c UStG forbids simply deleting or silently correcting an issued
    invoice — it must be reversed with a formal counter-document. `reason`
    is the free-text justification kept on the original (see
    `models.Invoice.cancel_reason`) and is required and non-blank; it is
    NOT printed on the resulting cancellation invoice itself.
    """

    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Stornogrund darf nicht leer sein.")
        return v


class CancelAndCorrectOut(BaseModel):
    """Response for `POST /invoices/{id}/cancel-and-correct`: the new
    cancellation invoice, plus a fresh editable draft pre-filled from the
    original for the user to correct and re-issue.
    """

    cancellation: InvoiceOut
    draft: InvoiceOut


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
