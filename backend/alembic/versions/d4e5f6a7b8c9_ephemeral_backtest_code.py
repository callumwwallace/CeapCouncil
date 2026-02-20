"""ephemeral backtest - code column, nullable strategy_id

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('backtests', sa.Column('code', sa.Text(), nullable=True))
    op.alter_column(
        'backtests',
        'strategy_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'backtests',
        'strategy_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column('backtests', 'code')
