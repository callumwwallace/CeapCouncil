from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Float, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class BacktestStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Backtest(Base):
    __tablename__ = "backtests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Configuration
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    initial_capital: Mapped[float] = mapped_column(Float, default=10000.0)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    slippage: Mapped[float] = mapped_column(Float, default=0.001)
    commission: Mapped[float] = mapped_column(Float, default=0.001)

    # Status
    status: Mapped[BacktestStatus] = mapped_column(
        SQLEnum(BacktestStatus),
        default=BacktestStatus.PENDING,
    )
    error_message: Mapped[str | None] = mapped_column(String(1000))

    # Results
    results: Mapped[dict | None] = mapped_column(JSON)
    total_return: Mapped[float | None] = mapped_column(Float)
    sharpe_ratio: Mapped[float | None] = mapped_column(Float)
    max_drawdown: Mapped[float | None] = mapped_column(Float)
    win_rate: Mapped[float | None] = mapped_column(Float)
    total_trades: Mapped[int | None] = mapped_column()

    # Extended metrics
    sortino_ratio: Mapped[float | None] = mapped_column(Float)
    profit_factor: Mapped[float | None] = mapped_column(Float)
    avg_trade_duration: Mapped[float | None] = mapped_column(Float)  # in days
    max_consecutive_losses: Mapped[int | None] = mapped_column()
    calmar_ratio: Mapped[float | None] = mapped_column(Float)
    exposure_pct: Mapped[float | None] = mapped_column(Float)

    # Results storage
    results_file_url: Mapped[str | None] = mapped_column(String(500))

    # Relations
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    strategy_id: Mapped[int | None] = mapped_column(ForeignKey("strategies.id"), nullable=True)

    # Inline code; when set, use instead of strategy.code
    code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Celery task tracking
    celery_task_id: Mapped[str | None] = mapped_column(String(50))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="backtests")
    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="backtests")
