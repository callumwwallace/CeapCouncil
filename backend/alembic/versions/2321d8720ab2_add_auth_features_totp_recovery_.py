"""add_auth_features_totp_recovery_password_changed

Revision ID: 2321d8720ab2
Revises: o4d5e6f7a8b9
Create Date: 2026-03-20 18:41:48.770337

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2321d8720ab2'
down_revision: Union[str, None] = 'o4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('recovery_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(length=255), nullable=False),
    sa.Column('used_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recovery_codes_id'), 'recovery_codes', ['id'], unique=False)
    op.create_index(op.f('ix_recovery_codes_user_id'), 'recovery_codes', ['user_id'], unique=False)
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('totp_secret_encrypted', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_index(op.f('ix_recovery_codes_user_id'), table_name='recovery_codes')
    op.drop_index(op.f('ix_recovery_codes_id'), table_name='recovery_codes')
    op.drop_table('recovery_codes')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret_encrypted')
    op.drop_column('users', 'password_changed_at')
