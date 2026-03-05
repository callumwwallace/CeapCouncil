"""add ranking_metrics to competitions

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        r = conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='competitions' AND column_name='ranking_metrics'"
        ))
        if r.fetchone() is None:
            op.add_column('competitions', sa.Column('ranking_metrics', sa.JSON(), nullable=True))
    elif conn.dialect.name == "sqlite":
        r = conn.execute(sa.text(
            "SELECT name FROM pragma_table_info('competitions') WHERE name='ranking_metrics'"
        ))
        if r.fetchone() is None:
            op.add_column('competitions', sa.Column('ranking_metrics', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('competitions', 'ranking_metrics')
