"""draft invoices: nullable number, add issued_at

Revision ID: ea183f067399
Revises: d114b4006251
Create Date: 2026-08-31 08:36:05.465543

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea183f067399'
down_revision: Union[str, None] = 'd114b4006251'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate emits plain op.alter_column() for the nullable flips, but
    # SQLite has no `ALTER TABLE ... ALTER COLUMN` — it needs the batch
    # mode below (rebuild-table-and-copy under the hood) to change column
    # nullability. Adjusted by hand; see AGENTS.md's migration workflow.
    # Existing rows (all currently status="offen" with a number already
    # set) are copied over untouched — this only relaxes constraints and
    # adds a new nullable column, it changes no data.
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("issued_at", sa.Date(), nullable=True))
        batch_op.alter_column(
            "number",
            existing_type=sa.VARCHAR(),
            nullable=True,
        )
        batch_op.alter_column(
            "is_kleinunternehmer",
            existing_type=sa.BOOLEAN(),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.alter_column(
            "is_kleinunternehmer",
            existing_type=sa.BOOLEAN(),
            nullable=False,
        )
        batch_op.alter_column(
            "number",
            existing_type=sa.VARCHAR(),
            nullable=False,
        )
        batch_op.drop_column("issued_at")
