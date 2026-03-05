"""add competitions, competition_entries, badges

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Add asset_type to competitions if missing (tables may exist from create_all)
    try:
        if conn.dialect.name == "postgresql":
            r = conn.execute(sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='competitions' AND column_name='asset_type'"
            ))
            if r.fetchone() is None:
                op.add_column('competitions', sa.Column('asset_type', sa.String(50), nullable=True))
        elif conn.dialect.name == "sqlite":
            r = conn.execute(sa.text(
                "SELECT name FROM pragma_table_info('competitions') WHERE name='asset_type'"
            ))
            if r.fetchone() is None:
                op.add_column('competitions', sa.Column('asset_type', sa.String(50), nullable=True))
    except Exception:
        pass
    # Create badges table only if it doesn't exist
    if conn.dialect.name == "postgresql":
        r = conn.execute(sa.text(
            "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name='badges')"
        ))
        if r.fetchone()[0]:
            return
    op.create_table(
        'badges',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('competition_id', sa.Integer(), sa.ForeignKey('competitions.id'), nullable=False),
        sa.Column('competition_title', sa.String(200), nullable=False),
        sa.Column('badge_tier', sa.String(20), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('earned_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('badges')
