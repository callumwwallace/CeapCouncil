"""add user_follows and skill_endorsements tables

Revision ID: j9e0f1a2b3c4
Revises: i8d9e0f1a2b3
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j9e0f1a2b3c4'
down_revision: Union[str, None] = 'i8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_follows',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('follower_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('following_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('follower_id', 'following_id', name='uq_follow_pair'),
    )

    op.create_table(
        'skill_endorsements',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('endorser_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('target_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('skill', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('endorser_id', 'target_id', 'skill', name='uq_endorsement_skill_pair'),
    )


def downgrade() -> None:
    op.drop_table('skill_endorsements')
    op.drop_table('user_follows')
