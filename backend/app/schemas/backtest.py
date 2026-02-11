from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field, model_validator

from app.models.backtest import BacktestStatus


class BacktestCreate(BaseModel):
    strategy_id: int
    symbol: str = Field(..., min_length=1, max_length=20)
    symbols: list[str] | None = Field(default=None, description="Additional symbols for multi-asset strategies")
    start_date: datetime
    end_date: datetime
    initial_capital: float = Field(default=10000.0, ge=100, le=10_000_000)
    parameters: dict = Field(default_factory=dict)
    slippage: float = Field(default=0.001, ge=0, le=0.1)  # 0.1% default, max 10%
    commission: float = Field(default=0.001, ge=0, le=0.05)  # 0.1% default, max 5%
    # Position sizing
    sizing_method: str = Field(default="full", pattern=r"^(full|percent_equity|fixed_shares|fixed_dollar)$")
    sizing_value: float | None = Field(default=None, ge=0)
    # Risk management
    stop_loss_pct: float | None = Field(default=None, ge=0, le=50)
    take_profit_pct: float | None = Field(default=None, ge=0, le=500)
    # Benchmark
    benchmark_symbol: str | None = Field(default=None, max_length=20)
    # Data interval
    interval: str = Field(default="1d", pattern=r"^(1d|1h|15m|5m)$")

    @model_validator(mode="after")
    def validate_dates(self) -> "BacktestCreate":
        now = datetime.now(timezone.utc)
        start = self.start_date
        end = self.end_date

        # Ensure start_date is timezone-aware for comparison
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)

        if end <= start:
            raise ValueError("end_date must be after start_date")

        if start > now:
            raise ValueError("start_date cannot be in the future")

        max_range = timedelta(days=365 * 10)
        if (end - start) > max_range:
            raise ValueError("Date range cannot exceed 10 years")

        return self


class BacktestResponse(BaseModel):
    id: int
    strategy_id: int
    user_id: int
    symbol: str
    start_date: datetime
    end_date: datetime
    initial_capital: float
    parameters: dict
    status: BacktestStatus
    error_message: str | None

    # Results — the `results` dict may contain `trades` and `equity_curve` sub-keys
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
