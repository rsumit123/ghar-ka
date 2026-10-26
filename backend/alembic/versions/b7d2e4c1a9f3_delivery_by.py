"""who delivers: the cook or a delivery partner

Revision ID: b7d2e4c1a9f3
Revises: 9c1b1afa5c6d
Create Date: 2026-10-26 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d2e4c1a9f3'
down_revision: Union[str, None] = '9c1b1afa5c6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('vendors', schema=None) as batch_op:
        batch_op.add_column(sa.Column('delivery_by', sa.String(length=24), nullable=False, server_default='self'))
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('delivery_by', sa.String(length=24), nullable=True))
    # Every delivery so far was the cook's own.
    op.execute("UPDATE orders SET delivery_by = 'self' WHERE fulfilment = 'delivery'")


def downgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_column('delivery_by')
    with op.batch_alter_table('vendors', schema=None) as batch_op:
        batch_op.drop_column('delivery_by')
