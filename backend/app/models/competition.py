"""Competition, leaderboard, and badge models."""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Float, Boolean, JSON, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from sqlalchemy import Enum as SQLEnum

from app.core.database import Base


class CompetitionStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    JUDGING = "judging"
    COMPLETED = "completed"


class BadgeTier(str, enum.Enum):
    WINNER = "winner"
    TOP_10 = "top_10"
    TOP_25 = "top_25"
    PARTICIPANT = "participant"


class Competition(Base):
    __tablename__ = "competitions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Rules
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)  # Primary / first symbol (backward compat)
    symbols: Mapped[list | None] = mapped_column(JSON, nullable=True)  # Multi-asset: list of symbols
    asset_type: Mapped[str | None] = mapped_column(String(50), default="equities")
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    backtest_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    backtest_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    initial_capital: Mapped[float] = mapped_column(Float, default=10000.0)
    ranking_metric: Mapped[str] = mapped_column(String(50), default="sharpe_ratio")
    # Optional: list of metrics for composite scoring. When set, score = -avg(rank per metric).
    ranking_metrics: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Status
    status: Mapped[CompetitionStatus] = mapped_column(
        SQLEnum(CompetitionStatus), default=CompetitionStatus.DRAFT
    )
    max_entries: Mapped[int | None] = mapped_column(Integer)

    # Metadata
    rules: Mapped[dict | None] = mapped_column(JSON)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    entries: Mapped[list["CompetitionEntry"]] = relationship(
        "CompetitionEntry", back_populates="competition", cascade="all, delete-orphan"
    )
    creator: Mapped["User"] = relationship("User")


class CompetitionEntry(Base):
    __tablename__ = "competition_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    backtest_id: Mapped[int | None] = mapped_column(ForeignKey("backtests.id"))

    # Results (denormalized for fast leaderboard)
    total_return: Mapped[float | None] = mapped_column(Float)
    sharpe_ratio: Mapped[float | None] = mapped_column(Float)
    max_drawdown: Mapped[float | None] = mapped_column(Float)
    win_rate: Mapped[float | None] = mapped_column(Float)
    sortino_ratio: Mapped[float | None] = mapped_column(Float)
    calmar_ratio: Mapped[float | None] = mapped_column(Float)
    total_trades: Mapped[int | None] = mapped_column(Integer)
    rank: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[float | None] = mapped_column(Float)

    # Timestamps
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    competition: Mapped["Competition"] = relationship("Competition", back_populates="entries")
    user: Mapped["User"] = relationship("User")
    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="competition_entries")


class Badge(Base):
    """Permanent achievement for competition rankings. Survives after competition data is purged."""

    __tablename__ = "badges"
    __table_args__ = (
        UniqueConstraint("user_id", "competition_id", name="uq_badge_user_competition"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id"), nullable=False)
    competition_title: Mapped[str] = mapped_column(String(200), nullable=False)
    badge_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User")


class CompetitionProposal(Base):
    """Community-voted competition proposal. Top-voted proposals become active competitions each week."""

    __tablename__ = "competition_proposals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    backtest_start: Mapped[str] = mapped_column(String(10), nullable=False)  # "YYYY-MM-DD"
    backtest_end: Mapped[str] = mapped_column(String(10), nullable=False)
    initial_capital: Mapped[float] = mapped_column(Float, default=10000.0)
    ranking_metric: Mapped[str] = mapped_column(String(50), default="sharpe_ratio")
    ranking_metrics: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Voting
    vote_count: Mapped[int] = mapped_column(Integer, default=0)

    # Status: pending → approved (became competition) | expired (week passed without winning)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    competition_id: Mapped[int | None] = mapped_column(ForeignKey("competitions.id"), nullable=True)

    # Week tracking — proposals compete within a calendar week (ISO week number)
    week_year: Mapped[int] = mapped_column(Integer, nullable=False)  # e.g. 2026
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-52

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    votes: Mapped[list["ProposalVote"]] = relationship(
        "ProposalVote", back_populates="proposal", cascade="all, delete-orphan"
    )


class ProposalVote(Base):
    """One vote per user per week. Users get 5 votes per week to distribute across proposals."""

    __tablename__ = "proposal_votes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("competition_proposals.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    proposal: Mapped["CompetitionProposal"] = relationship("CompetitionProposal", back_populates="votes")
    user: Mapped["User"] = relationship("User")
