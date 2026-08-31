"""merge invoice sequence and draft invoices branches

Revision ID: 52a48a0be435
Revises: 54bbcabaf343, ea183f067399
Create Date: 2026-08-31 13:34:40.765657

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52a48a0be435'
down_revision: Union[str, None] = ('54bbcabaf343', 'ea183f067399')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
