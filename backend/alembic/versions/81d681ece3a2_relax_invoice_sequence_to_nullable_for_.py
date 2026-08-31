"""relax invoice sequence to nullable for drafts

Revision ID: 81d681ece3a2
Revises: 52a48a0be435
Create Date: 2026-08-31 13:34:53.460598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81d681ece3a2'
down_revision: Union[str, None] = '52a48a0be435'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate emits a plain op.alter_column(), but SQLite has no
    # native `ALTER TABLE ... ALTER COLUMN` - batch mode is needed (same
    # pattern as the two migrations this one merges). A draft invoice
    # (issue #25) has no sequence assigned until issue time, so the
    # column - previously NOT NULL, added by the invoice-numbering fix -
    # must allow NULL.
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.alter_column(
            "sequence",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.alter_column(
            "sequence",
            existing_type=sa.Integer(),
            nullable=False,
        )
