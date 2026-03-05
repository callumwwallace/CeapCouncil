"""add user notification preference columns

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('notify_on_mention', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('users', sa.Column('email_on_mention', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('email_marketing', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'email_marketing')
    op.drop_column('users', 'email_on_mention')
    op.drop_column('users', 'notify_on_mention')
