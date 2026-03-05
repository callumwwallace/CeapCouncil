"""add user_reputation table

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_reputation',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('voter_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('target_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('voter_id', 'target_id', name='uq_reputation_voter_target'),
    )
    op.create_index('ix_user_reputation_target_id', 'user_reputation', ['target_id'])
    op.create_index('ix_user_reputation_voter_id', 'user_reputation', ['voter_id'])


def downgrade() -> None:
    op.drop_index('ix_user_reputation_voter_id', table_name='user_reputation')
    op.drop_index('ix_user_reputation_target_id', table_name='user_reputation')
    op.drop_table('user_reputation')
