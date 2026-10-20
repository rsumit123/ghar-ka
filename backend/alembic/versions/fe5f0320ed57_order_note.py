"""order note

Revision ID: fe5f0320ed57
Revises: 50374198884a
Create Date: 2026-10-20 03:52:22.837047
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fe5f0320ed57'
down_revision: Union[str, None] = '50374198884a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('note', sa.String(length=300), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_column('note')

