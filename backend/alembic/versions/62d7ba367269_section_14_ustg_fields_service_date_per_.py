"""section 14 UStG fields: service date, per-item vat rate, USt-IdNr

Revision ID: 62d7ba367269
Revises: 81d681ece3a2
Create Date: 2026-08-31 10:57:55.980552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62d7ba367269'
down_revision: Union[str, None] = '81d681ece3a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adjusted by hand from autogenerate — see AGENTS.md's migration
    # workflow. Issue #33 moves vat_rate from Invoice onto InvoiceItem (one
    # rate per line, since mixing 19%/7% lines on one invoice is normal for
    # this business) and adds the Leistungsdatum/-zeitraum + USt-IdNr
    # fields. The vat_rate move needs a backfill, not just a column
    # add/drop, so every existing item ends up carrying its parent
    # invoice's rate before that column disappears.
    op.add_column('invoices', sa.Column('service_date', sa.Date(), nullable=True))
    op.add_column('invoices', sa.Column('service_period_text', sa.String(), nullable=True))
    op.add_column('settings', sa.Column('ust_id_nr', sa.String(), nullable=True))

    # Add nullable first (existing rows have no value yet), backfill from
    # the parent invoice's vat_rate, then tighten to NOT NULL — SQLite has
    # no ALTER COLUMN, hence the batch_alter_table for that last step (same
    # pattern ea183f067399 used for its nullable flips).
    op.add_column('invoice_items', sa.Column('vat_rate', sa.Numeric(precision=5, scale=2), nullable=True))
    op.execute(
        """
        UPDATE invoice_items
        SET vat_rate = (
            SELECT COALESCE(invoices.vat_rate, 0)
            FROM invoices
            WHERE invoices.id = invoice_items.invoice_id
        )
        WHERE vat_rate IS NULL
        """
    )
    with op.batch_alter_table("invoice_items", schema=None) as batch_op:
        batch_op.alter_column(
            "vat_rate",
            existing_type=sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0",
        )

    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_column("vat_rate")


def downgrade() -> None:
    # Lossy: an invoice with mixed per-line rates cannot round-trip back
    # onto a single invoice-level vat_rate, so this recreates the column
    # from the first item's rate (or 0 with no items) — good enough to
    # restore the old shape, not to recover exact history.
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("vat_rate", sa.Numeric(precision=5, scale=2), nullable=True))
    op.execute(
        """
        UPDATE invoices
        SET vat_rate = COALESCE(
            (SELECT vat_rate FROM invoice_items WHERE invoice_items.invoice_id = invoices.id ORDER BY id LIMIT 1),
            0
        )
        """
    )
    with op.batch_alter_table("invoice_items", schema=None) as batch_op:
        batch_op.drop_column("vat_rate")

    op.drop_column('settings', 'ust_id_nr')
    op.drop_column('invoices', 'service_period_text')
    op.drop_column('invoices', 'service_date')
