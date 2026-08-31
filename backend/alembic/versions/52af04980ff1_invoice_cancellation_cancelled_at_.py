"""invoice cancellation: cancelled_at, cancel_reason, cancels_invoice_id

Revision ID: 52af04980ff1
Revises: 62d7ba367269
Create Date: 2026-08-31 11:18:04.551159

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52af04980ff1'
down_revision: Union[str, None] = '62d7ba367269'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adjusted by hand from autogenerate — see AGENTS.md's migration
    # workflow. SQLite has no ALTER TABLE ADD CONSTRAINT, so the
    # self-referential FK (cancels_invoice_id -> invoices.id, issue #26)
    # needs batch_alter_table's copy-and-move strategy, same as
    # 62d7ba367269's column drops.
    op.add_column('invoices', sa.Column('cancelled_at', sa.Date(), nullable=True))
    op.add_column('invoices', sa.Column('cancel_reason', sa.Text(), nullable=True))
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column('cancels_invoice_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_invoices_cancels_invoice_id'), ['cancels_invoice_id'], unique=False)
        batch_op.create_foreign_key(
            "fk_invoices_cancels_invoice_id_invoices", "invoices", ["cancels_invoice_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_constraint("fk_invoices_cancels_invoice_id_invoices", type_="foreignkey")
        batch_op.drop_index(batch_op.f('ix_invoices_cancels_invoice_id'))
        batch_op.drop_column('cancels_invoice_id')
    op.drop_column('invoices', 'cancel_reason')
    op.drop_column('invoices', 'cancelled_at')
