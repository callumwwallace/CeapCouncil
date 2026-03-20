from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(100))
    bio: Mapped[str | None] = mapped_column(String(500))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    totp_secret_encrypted: Mapped[str | None] = mapped_column(String(255), default=None)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_mention: Mapped[bool] = mapped_column(Boolean, default=True)
    email_on_mention: Mapped[bool] = mapped_column(Boolean, default=False)
    email_marketing: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    strategies: Mapped[list["Strategy"]] = relationship("Strategy", back_populates="author")
    backtests: Mapped[list["Backtest"]] = relationship("Backtest", back_populates="user")
    votes: Mapped[list["Vote"]] = relationship("Vote", back_populates="user")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="user")
    badges: Mapped[list["Badge"]] = relationship("Badge", back_populates="user")
    blog_posts: Mapped[list["BlogPost"]] = relationship("BlogPost", back_populates="author")
    blog_comments: Mapped[list["BlogComment"]] = relationship("BlogComment", back_populates="author", cascade="all, delete-orphan")
    forum_threads: Mapped[list["ForumThread"]] = relationship(
        "ForumThread", back_populates="author", cascade="all, delete-orphan"
    )
    forum_posts: Mapped[list["ForumPost"]] = relationship(
        "ForumPost", back_populates="author", cascade="all, delete-orphan"
    )
    thread_votes: Mapped[list["ThreadVote"]] = relationship(
        "ThreadVote", back_populates="user", cascade="all, delete-orphan"
    )
    post_votes: Mapped[list["PostVote"]] = relationship(
        "PostVote", back_populates="user", cascade="all, delete-orphan"
    )
    achievements: Mapped[list["UserAchievement"]] = relationship("UserAchievement", back_populates="user", cascade="all, delete-orphan")
    recovery_codes: Mapped[list["RecoveryCode"]] = relationship(
        "RecoveryCode", back_populates="user", cascade="all, delete-orphan"
    )
