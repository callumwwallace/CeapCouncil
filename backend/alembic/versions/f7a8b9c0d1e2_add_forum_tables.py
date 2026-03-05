"""add forum_topics, forum_threads, forum_posts

Revision ID: f7a8b9c0d1e2
Revises: b8c9d0e1f2a3
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    tables_exist = False
    if conn.dialect.name == "postgresql":
        r = conn.execute(sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'forum_topics')"
        ))
        tables_exist = r.scalar() if r.returns_rows else False

    if not tables_exist:
        op.create_table(
            'forum_topics',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('slug', sa.String(50), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.String(300)),
            sa.Column('section', sa.String(50), nullable=False),
            sa.Column('sort_order', sa.Integer(), server_default='0'),
        )
        op.create_index('ix_forum_topics_slug', 'forum_topics', ['slug'], unique=True)
        op.create_table(
            'forum_threads',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('topic_id', sa.Integer(), sa.ForeignKey('forum_topics.id'), nullable=False),
            sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_forum_threads_topic_id', 'forum_threads', ['topic_id'])
        op.create_index('ix_forum_threads_author_id', 'forum_threads', ['author_id'])
        op.create_table(
            'forum_posts',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('thread_id', sa.Integer(), sa.ForeignKey('forum_threads.id'), nullable=False),
            sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_forum_posts_thread_id', 'forum_posts', ['thread_id'])
        op.create_index('ix_forum_posts_author_id', 'forum_posts', ['author_id'])

    # Seed forum topics (skip if already seeded)
    if conn.dialect.name == "postgresql":
        count_result = conn.execute(sa.text("SELECT COUNT(*) FROM forum_topics"))
        count = count_result.scalar() if count_result.returns_rows else 0
        if count and count > 0:
            return

    topics = [
        ('news', 'News & Announcements', 'Platform updates, new features, maintenance', 'official', 0),
        ('api-docs', 'API & Documentation', 'API help and documentation discussions', 'official', 1),
        ('feedback', 'Platform Feedback', 'Suggestions and bug reports', 'official', 2),
        ('general', 'General Discussion', 'Talk about markets, trading, and Ceap Council', 'community', 3),
        ('showcase', 'Strategy Showcase', 'Share strategies and backtest results', 'community', 4),
        ('dev-help', 'Strategy Development Help', 'Coding help, debugging, platform logic', 'community', 5),
        ('backtesting', 'Backtesting & Data', 'Best practices, data sources, metrics', 'community', 6),
        ('current', 'Current Competitions', 'Active competitions and leaderboard chat', 'competitions', 7),
        ('archives', 'Past Competition Archives', 'Historical results and winning strategies', 'competitions', 8),
        ('competition-ideas', 'Competition Ideas & Feedback', 'Suggest future competitions', 'competitions', 9),
        ('fundamentals', 'Algorithmic Trading Fundamentals', 'Beginner concepts, resources, best practices', 'education', 10),
        ('advanced', 'Advanced Topics & Research', 'ML in finance, complex algorithms, research', 'education', 11),
        ('bugs', 'Bug Reports', 'Report bugs and issues', 'support', 12),
        ('features', 'Feature Requests', 'Request new features', 'support', 13),
    ]
    for slug, name, desc, section, sort_order in topics:
        conn.execute(
            sa.text(
                "INSERT INTO forum_topics (slug, name, description, section, sort_order) "
                "VALUES (:slug, :name, :desc, :section, :sort_order)"
            ),
            {"slug": slug, "name": name, "desc": desc, "section": section, "sort_order": sort_order},
        )


def downgrade() -> None:
    op.drop_index('ix_forum_posts_author_id', table_name='forum_posts')
    op.drop_index('ix_forum_posts_thread_id', table_name='forum_posts')
    op.drop_table('forum_posts')
    op.drop_index('ix_forum_threads_author_id', table_name='forum_threads')
    op.drop_index('ix_forum_threads_topic_id', table_name='forum_threads')
    op.drop_table('forum_threads')
    op.drop_index('ix_forum_topics_slug', table_name='forum_topics')
    op.drop_table('forum_topics')
