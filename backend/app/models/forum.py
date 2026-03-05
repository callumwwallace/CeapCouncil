"""Forum models: topics, threads, posts."""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ForumTopic(Base):
    __tablename__ = "forum_topics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    section: Mapped[str] = mapped_column(String(50), nullable=False)  # official, community, competitions, education, support
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    threads: Mapped[list["ForumThread"]] = relationship(
        "ForumThread", back_populates="topic", cascade="all, delete-orphan"
    )


class ForumThread(Base):
    __tablename__ = "forum_threads"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("forum_topics.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    topic: Mapped["ForumTopic"] = relationship("ForumTopic", back_populates="threads")
    author: Mapped["User"] = relationship("User", back_populates="forum_threads")
    posts: Mapped[list["ForumPost"]] = relationship(
        "ForumPost", back_populates="thread", cascade="all, delete-orphan", order_by="ForumPost.created_at"
    )


class ForumPost(Base):
    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_threads.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    thread: Mapped["ForumThread"] = relationship("ForumThread", back_populates="posts")
    author: Mapped["User"] = relationship("User", back_populates="forum_posts")
