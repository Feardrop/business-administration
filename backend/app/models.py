"""SQLAlchemy models.

Monetary amounts use Numeric(10, 2) rather than Float, so values are kept
as exact decimals instead of accumulating binary floating-point rounding
errors across many invoices/items.

When you change this file, generate a migration instead of editing the
database by hand:

    alembic revision --autogenerate -m "describe the change"
    alembic upgrade head

See /AGENTS.md for the full workflow.
"""

import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


class Settings(Base):
    """Singleton row (id is always 1) holding the business's own data."""

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    business_name = Column(String, default="")
    owner_name = Column(String, default="")
    address = Column(Text, default="")
    tax_number = Column(String, default="")
    iban = Column(String, default="")
    kleinunternehmer = Column(Boolean, default=True, nullable=False)
    prev_year_revenue = Column(Numeric(10, 2), default=0)
    invoice_prefix = Column(String, default="")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    number = Column(String, unique=True, nullable=False, index=True)
    date = Column(Date, nullable=False)
    client_name = Column(String, nullable=False)
    client_address = Column(Text, default="")
    is_kleinunternehmer = Column(Boolean, nullable=False)
    vat_rate = Column(Numeric(5, 2), default=0)
    note = Column(Text, default="")
    status = Column(String, default="offen")  # "offen" | "bezahlt"
    paid_date = Column(Date, nullable=True)
    # dt.datetime.utcnow() is deprecated (returns a naive datetime with no
    # indication it's UTC); this keeps the same naive-UTC value the column
    # already relied on rather than switching to timezone-aware storage.
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.UTC).replace(tzinfo=None))

    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.id",
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=False)
    qty = Column(Numeric(10, 2), nullable=False, default=1)
    price = Column(Numeric(10, 2), nullable=False, default=0)  # net unit price

    invoice = relationship("Invoice", back_populates="items")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
