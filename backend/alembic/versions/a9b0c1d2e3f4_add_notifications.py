"""add notifications table

Revision ID: a9b0c1d2e3f4
Revises: f7a8b9c0d1e2
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    tables_exist = False
    if conn.dialect.name == "postgresql":
        r = conn.execute(sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications')"
        ))
        tables_exist = r.scalar() if r.returns_rows else False

    if not tables_exist:
        op.create_table(
            'notifications',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('type', sa.String(20), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('link', sa.String(500), nullable=False),
            sa.Column('post_id', sa.Integer(), sa.ForeignKey('forum_posts.id')),
            sa.Column('read_at', sa.DateTime()),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
        op.create_index('ix_notifications_user_id_read_at', 'notifications', ['user_id', 'read_at'])


def downgrade() -> None:
    op.drop_index('ix_notifications_user_id_read_at', 'notifications')
    op.drop_index('ix_notifications_user_id', 'notifications')
    op.drop_table('notifications')
