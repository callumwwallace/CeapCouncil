"""add strategy versioning

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-11 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add version column to strategies (if not exists)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='strategies' AND column_name='version'"
    ))
    if result.fetchone() is None:
        op.add_column('strategies', sa.Column('version', sa.Integer(), nullable=True, server_default='1'))

    # Create strategy_versions table (if not exists)
    result = conn.execute(sa.text(
        "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name='strategy_versions')"
    ))
    if not result.fetchone()[0]:
        op.create_table(
            'strategy_versions',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('strategy_id', sa.Integer(), sa.ForeignKey('strategies.id'), nullable=False),
            sa.Column('version', sa.Integer(), nullable=False),
            sa.Column('code', sa.Text(), nullable=False),
            sa.Column('parameters', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_strategy_versions_strategy_id', 'strategy_versions', ['strategy_id'])


def downgrade() -> None:
    op.drop_index('ix_strategy_versions_strategy_id', 'strategy_versions')
    op.drop_table('strategy_versions')
    op.drop_column('strategies', 'version')
