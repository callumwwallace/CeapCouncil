"""add symbols to competitions for multi-asset support

Revision ID: i8d9e0f1a2b3
Revises: f5d63918fa05
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i8d9e0f1a2b3'
down_revision: Union[str, None] = 'h7c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        r = conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='competitions' AND column_name='symbols'"
        ))
        if r.fetchone() is None:
            op.add_column('competitions', sa.Column('symbols', sa.JSON(), nullable=True))
    elif conn.dialect.name == "sqlite":
        r = conn.execute(sa.text(
            "SELECT name FROM pragma_table_info('competitions') WHERE name='symbols'"
        ))
        if r.fetchone() is None:
            op.add_column('competitions', sa.Column('symbols', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('competitions', 'symbols')
