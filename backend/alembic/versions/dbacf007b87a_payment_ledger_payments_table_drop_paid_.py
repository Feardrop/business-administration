"""payment ledger: payments table, drop paid_date

Revision ID: dbacf007b87a
Revises: 52af04980ff1
Create Date: 2026-08-31 11:36:32.133540

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dbacf007b87a'
down_revision: Union[str, None] = '52af04980ff1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adjusted by hand from autogenerate — see AGENTS.md's migration
    # workflow. Issue #30 replaces the boolean Invoice.paid_date toggle
    # with a real payment ledger. Every existing invoice with a non-null
    # paid_date (legacy "fully paid, on this one date" data) is backfilled
    # into exactly one full-gross-amount Payment row dated paid_date,
    # *before* the column disappears — same order as 62d7ba367269's
    # vat_rate move (add new shape, backfill from the old, then drop).
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('invoice_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('method', sa.String(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_payments_invoice_id'), 'payments', ['invoice_id'], unique=False)

    # Gross total per invoice = SUM(qty * price * (1 + rate/100)), with
    # rate forced to 0 for a Kleinunternehmer invoice regardless of what
    # its (irrelevant) per-line vat_rate happens to be — the same rule
    # models.invoice_gross_total applies in Python, expressed in SQL since
    # migrations can't import app code. Rounded to 2dp to match the
    # Numeric(10, 2) column both sides of this write use.
    op.execute(
        """
        INSERT INTO payments (invoice_id, date, amount, method, note)
        SELECT
            i.id,
            i.paid_date,
            ROUND(SUM(
                ii.qty * ii.price * (
                    1 + (CASE WHEN i.is_kleinunternehmer THEN 0 ELSE ii.vat_rate END) / 100.0
                )
            ), 2),
            'other',
            'Migriert aus vormaligem paid_date (Altdaten-Backfill, issue #30).'
        FROM invoices i
        JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE i.paid_date IS NOT NULL
        GROUP BY i.id
        """
    )

    # SQLite has no ALTER TABLE DROP COLUMN without batch mode's
    # copy-and-move strategy — same pattern as 62d7ba367269's vat_rate drop
    # and 52af04980ff1's FK add.
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_column('paid_date')


def downgrade() -> None:
    # Lossy: a multi-payment ledger cannot round-trip back onto a single
    # "fully paid, on this one date" boolean. Recreates paid_date from the
    # most recent payment's date on any invoice currently "bezahlt" (good
    # enough to restore the old shape, not to recover exact history — same
    # tradeoff 62d7ba367269's downgrade makes for vat_rate).
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column('paid_date', sa.Date(), nullable=True))

    op.execute(
        """
        UPDATE invoices
        SET paid_date = (
            SELECT MAX(p.date) FROM payments p WHERE p.invoice_id = invoices.id
        )
        WHERE invoices.status = 'bezahlt'
        """
    )

    op.drop_index(op.f('ix_payments_invoice_id'), table_name='payments')
    op.drop_table('payments')
