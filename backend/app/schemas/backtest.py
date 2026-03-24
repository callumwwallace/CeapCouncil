from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field, model_validator

from app.models.backtest import BacktestStatus


class BacktestCreate(BaseModel):
    strategy_id: int | None = None  # Omit when passing inline code
    code: str | None = None  # Inline strategy code when no saved strategy
    symbol: str = Field(..., min_length=1, max_length=20)
    symbols: list[str] | None = Field(default=None, description="Additional symbols for multi-asset strategies")
    start_date: datetime
    end_date: datetime
    initial_capital: float = Field(default=10000.0, ge=100, le=10_000_000)
    parameters: dict = Field(default_factory=dict)
    slippage: float = Field(default=0.001, ge=0, le=0.1)  # 0.1% default, max 10%
    commission: float = Field(default=0.001, ge=0, le=0.05)  # 0.1% default, max 5%
    # Risk management
    stop_loss_pct: float | None = Field(default=None, ge=0, le=50)
    take_profit_pct: float | None = Field(default=None, ge=0, le=500)
    # Benchmark
    benchmark_symbol: str | None = Field(default=None, max_length=20)
    # Data interval
    interval: str = Field(default="1d", pattern=r"^(1d|1h|15m|5m|1m)$")

    @model_validator(mode="after")
    def validate_dates(self) -> "BacktestCreate":
        now = datetime.now(timezone.utc)
        start = self.start_date
        end = self.end_date

        # Make start_date timezone-aware for comparison
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)

        if self.strategy_id is None and (not self.code or not self.code.strip()):
            raise ValueError("Either strategy_id or code must be provided")

        if self.strategy_id is not None and self.code is not None:
            raise ValueError("Provide strategy_id OR code, not both")

        if end <= start:
            raise ValueError("end_date must be after start_date")

        if start > now:
            raise ValueError("start_date cannot be in the future")

        max_range = timedelta(days=365 * 10)
        if (end - start) > max_range:
            raise ValueError("Date range cannot exceed 10 years")

        return self


class BacktestWithCodeCreate(BaseModel):
    """Request body for inline-code backtests - code required, no strategy_id."""
    code: str = Field(..., min_length=1)
    symbol: str = Field(..., min_length=1, max_length=20)
    symbols: list[str] | None = Field(default=None)
    start_date: datetime
    end_date: datetime
    initial_capital: float = Field(default=10000.0, ge=100, le=10_000_000)
    parameters: dict = Field(default_factory=dict)
    slippage: float = Field(default=0.001, ge=0, le=0.1)
    commission: float = Field(default=0.001, ge=0, le=0.05)
    stop_loss_pct: float | None = Field(default=None, ge=0, le=50)
    take_profit_pct: float | None = Field(default=None, ge=0, le=500)
    benchmark_symbol: str | None = Field(default=None, max_length=20)
    interval: str = Field(default="1d", pattern=r"^(1d|1h|15m|5m|1m)$")

    @model_validator(mode="after")
    def validate_dates(self) -> "BacktestWithCodeCreate":
        now = datetime.now(timezone.utc)
        start = self.start_date.replace(tzinfo=timezone.utc) if self.start_date.tzinfo is None else self.start_date
        end = self.end_date.replace(tzinfo=timezone.utc) if self.end_date.tzinfo is None else self.end_date
        if end <= start:
            raise ValueError("end_date must be after start_date")
        if start > now:
            raise ValueError("start_date cannot be in the future")
        if (end - start) > timedelta(days=365 * 10):
            raise ValueError("Date range cannot exceed 10 years")
        return self


class BacktestResponse(BaseModel):
    id: int
    share_token: str
    strategy_id: int | None = None
    user_id: int
    symbol: str
    start_date: datetime
    end_date: datetime
    initial_capital: float
    parameters: dict
    status: BacktestStatus
    error_message: str | None

    # Results : the `results` dict may contain `trades` and `equity_curve` sub-keys
    results: dict | None
    total_return: float | None
    sharpe_ratio: float | None
    max_drawdown: float | None
    win_rate: float | None
    total_trades: int | None
    results_file_url: str | None

    # Extended metrics
    sortino_ratio: float | None = None
    profit_factor: float | None = None
    avg_trade_duration: float | None = None  # in days
    max_consecutive_losses: int | None = None
    calmar_ratio: float | None = None
    exposure_pct: float | None = None

    # Timestamps
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    class Config:
        from_attributes = True


class BacktestEmbedResponse(BaseModel):
    """Lightweight response for forum embeds — no code, no full results JSON."""
    id: int
    user_id: int
    symbol: str
    start_date: datetime
    end_date: datetime
    initial_capital: float
    parameters: dict
    status: BacktestStatus

    # Summary metrics only
    total_return: float | None
    sharpe_ratio: float | None
    max_drawdown: float | None
    win_rate: float | None
    total_trades: int | None

    # Extended metrics
    sortino_ratio: float | None = None
    profit_factor: float | None = None
    calmar_ratio: float | None = None

    created_at: datetime

    class Config:
        from_attributes = True
