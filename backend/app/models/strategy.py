from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Strategy(Base):
    __tablename__ = "strategies"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)  # JSON works on both Postgres and SQLite
    
    # Visibility
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Stats
    vote_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    fork_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1)
    
    # Forking
    forked_from_id: Mapped[int | None] = mapped_column(ForeignKey("strategies.id"))
    
    # Author
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    author: Mapped["User"] = relationship("User", back_populates="strategies")
    backtests: Mapped[list["Backtest"]] = relationship("Backtest", back_populates="strategy", cascade="all, delete-orphan")
    votes: Mapped[list["Vote"]] = relationship("Vote", back_populates="strategy", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="strategy", cascade="all, delete-orphan")
    forked_from: Mapped["Strategy | None"] = relationship("Strategy", remote_side=[id])
    versions: Mapped[list["StrategyVersion"]] = relationship("StrategyVersion", back_populates="strategy", order_by="StrategyVersion.version.desc()", cascade="all, delete-orphan")
    competition_entries: Mapped[list["CompetitionEntry"]] = relationship("CompetitionEntry", back_populates="strategy", cascade="all, delete-orphan")


class StrategyVersion(Base):
    __tablename__ = "strategy_versions"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    commit_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="versions")
