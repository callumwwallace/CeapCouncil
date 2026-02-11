"""add calmar_ratio and exposure_pct columns

Revision ID: a1b2c3d4e5f6
Revises: edd825e38250
Create Date: 2026-02-11 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'edd825e38250'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='backtests' AND column_name='calmar_ratio'"
    ))
    if result.fetchone() is None:
        op.add_column('backtests', sa.Column('calmar_ratio', sa.Float(), nullable=True))
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='backtests' AND column_name='exposure_pct'"
    ))
    if result.fetchone() is None:
        op.add_column('backtests', sa.Column('exposure_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('backtests', 'exposure_pct')
    op.drop_column('backtests', 'calmar_ratio')
