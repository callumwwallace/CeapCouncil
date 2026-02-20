"""Paper trading engine.

Real-time simulation using live market data feed with the same engine components.
Uses a real-time clock instead of simulation clock.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

from app.engine.broker.broker import BrokerSimulator, CommissionModel
from app.engine.broker.fill_models import FillModel
from app.engine.broker.slippage import PercentageSlippage
from app.engine.broker.spread import VolatilitySpread
from app.engine.core.clock import SimulationClock, ClockMode
from app.engine.core.engine import EngineConfig
from app.engine.data.feed import BarData
from app.engine.portfolio.portfolio import Portfolio
from app.engine.risk.manager import RiskManager, RiskLimits
from app.engine.strategy.base import StrategyBase, StrategyContext


@dataclass
class PaperTradingConfig:
    """Configuration for paper trading."""
    initial_capital: float = 100000.0
    commission_rate: float = 0.001
    slippage_pct: float = 0.1
    is_crypto: bool = False
    poll_interval_seconds: float = 60.0  # How often to fetch new data
    max_runtime_hours: float = 24.0


@dataclass
class PaperTradingState:
    """Current state of a paper trading session."""
    session_id: str = ""
    started_at: datetime | None = None
    status: str = "idle"  # idle, running, paused, stopped
    bars_processed: int = 0
    current_equity: float = 0.0
    current_pnl: float = 0.0
    open_positions: dict[str, float] = field(default_factory=dict)
    pending_orders: int = 0


class PaperTradingEngine:
    """Paper trading engine for forward-testing strategies with live data.

    Uses the same broker, portfolio, and risk management as the backtester
    but with a real-time clock and live data feed.
    """

    def __init__(self, config: PaperTradingConfig | None = None):
        self.config = config or PaperTradingConfig()
        self._strategy: StrategyBase | None = None
        self._symbols: list[str] = []
        self._state = PaperTradingState()
        self._running = False

        # Build components
        self._fill_model = FillModel(
            spread_model=VolatilitySpread(is_crypto=self.config.is_crypto),
            slippage_model=PercentageSlippage(pct=self.config.slippage_pct),
        )
        self._commission = CommissionModel(rate=self.config.commission_rate)
        self._broker = BrokerSimulator(
            fill_model=self._fill_model,
            commission=self._commission,
            initial_cash=self.config.initial_capital,
        )
        self._portfolio = Portfolio(initial_cash=self.config.initial_capital)
        self._risk_manager = RiskManager()
        self._clock = SimulationClock(ClockMode.PAPER)

        # Wire up
        self._broker.set_fill_callback(self._on_fill)

        # Callbacks for UI updates
        self._on_state_change: Callable[[PaperTradingState], None] | None = None
        self._on_bar: Callable[[BarData], None] | None = None

        # History for comparison
        self._equity_history: list[dict] = []

    def set_strategy(self, strategy: StrategyBase) -> None:
        self._strategy = strategy

    def add_symbol(self, symbol: str) -> None:
        self._symbols.append(symbol)

    def set_callbacks(
        self,
        on_state_change: Callable | None = None,
        on_bar: Callable | None = None,
    ) -> None:
        self._on_state_change = on_state_change
        self._on_bar = on_bar

    def get_state(self) -> PaperTradingState:
        """Get current paper trading state."""
        self._state.current_equity = self._portfolio.equity
        self._state.current_pnl = self._portfolio.total_pnl
        self._state.pending_orders = len(self._broker.pending_orders)
        self._state.open_positions = {
            s: p.quantity
            for s, p in self._portfolio._positions.items()
            if not p.is_flat
        }
        return self._state

    def process_bar(self, bar: BarData) -> None:
        """Process a single bar from live data feed.

        Called by the data polling loop or websocket handler.
        """
        if not self._strategy or not self._running:
            return

        timestamp = bar.timestamp
        self._portfolio.update_prices({bar.symbol: bar.close})

        # Process pending orders
        self._broker.process_bar(bar, timestamp)

        # Check risk
        violations = self._risk_manager.on_bar(self._portfolio, timestamp)

        # Call strategy
        ctx = self._strategy._context
        ctx.current_time = timestamp
        ctx.bar_index = self._state.bars_processed

        self._strategy._record_bar(bar)
        if not self._risk_manager.is_halted:
            self._strategy.on_data(bar)

        # Record equity
        self._portfolio.record_equity(timestamp)
        self._equity_history.append({
            "date": timestamp.isoformat(),
            "equity": round(self._portfolio.equity, 2),
        })

        self._state.bars_processed += 1
        if self._on_bar:
            self._on_bar(bar)
        if self._on_state_change:
            self._on_state_change(self.get_state())

    def start(self) -> None:
        """Start paper trading session."""
        if self._strategy is None:
            raise ValueError("No strategy set")

        ctx = StrategyContext(
            portfolio=self._portfolio,
            broker=self._broker,
        )
        self._strategy._set_context(ctx)
        self._strategy.on_init()

        self._running = True
        self._state.status = "running"
        self._state.started_at = datetime.utcnow()

    def stop(self) -> dict:
        """Stop paper trading and return results."""
        self._running = False
        self._state.status = "stopped"
        if self._strategy:
            self._strategy.on_end()

        return {
            "session_id": self._state.session_id,
            "status": "stopped",
            "bars_processed": self._state.bars_processed,
            "final_equity": round(self._portfolio.equity, 2),
            "total_pnl": round(self._portfolio.total_pnl, 2),
            "total_return_pct": round(self._portfolio.total_return_pct, 4),
            "trades": [t.to_dict() for t in self._portfolio.trades],
            "equity_history": self._equity_history[-200:],
        }

    def pause(self) -> None:
        self._running = False
        self._state.status = "paused"

    def resume(self) -> None:
        self._running = True
        self._state.status = "running"

    def _on_fill(self, fill) -> None:
        self._portfolio.on_fill(fill)
        if self._strategy:
            self._strategy.on_order_event(fill)


@dataclass
class BrokerAPIConfig:
    """Configuration for connecting to a real broker."""
    broker_name: str = "paper"   # "paper", "binance", "coinbase", "alpaca"
    api_key: str = ""
    api_secret: str = ""
    sandbox: bool = True         # Use sandbox/testnet
    base_url: str = ""


class BrokerAPIAdapter:
    """Abstract broker API adapter. Subclasses implement exchange-specific API calls."""

    def __init__(self, config: BrokerAPIConfig):
        self.config = config

    async def submit_order(self, symbol: str, side: str, quantity: float,
                          order_type: str = "market", price: float | None = None) -> dict:
        """Submit an order to the broker."""
        raise NotImplementedError("Implement in exchange-specific adapter")

    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        raise NotImplementedError

    async def get_positions(self) -> list[dict]:
        """Get current positions."""
        raise NotImplementedError

    async def get_account(self) -> dict:
        """Get account balance and info."""
        raise NotImplementedError

    async def get_orderbook(self, symbol: str) -> dict:
        """Get current order book."""
        raise NotImplementedError

    async def subscribe_bars(self, symbol: str, interval: str, callback: Callable) -> None:
        """Subscribe to real-time bar data."""
        raise NotImplementedError


class BacktestVsLiveComparator:
    """Compares backtest results against live/paper trading results."""

    def __init__(self):
        self.backtest_equity: list[dict] = []
        self.live_equity: list[dict] = []

    def set_backtest_curve(self, equity: list[dict]) -> None:
        self.backtest_equity = equity

    def add_live_point(self, date: str, equity: float) -> None:
        self.live_equity.append({"date": date, "equity": equity})

    def compute_tracking_error(self) -> float | None:
        """Compute tracking error between backtest and live."""
        if len(self.backtest_equity) < 2 or len(self.live_equity) < 2:
            return None

        # Align by date
        bt_map = {p["date"]: p["equity"] for p in self.backtest_equity}
        live_map = {p["date"]: p["equity"] for p in self.live_equity}

        common_dates = sorted(set(bt_map.keys()) & set(live_map.keys()))
        if len(common_dates) < 2:
            return None

        bt_vals = [bt_map[d] for d in common_dates]
        live_vals = [live_map[d] for d in common_dates]

        import numpy as np
        bt_returns = np.diff(bt_vals) / bt_vals[:-1]
        live_returns = np.diff(live_vals) / live_vals[:-1]

        tracking = live_returns - bt_returns
        return round(float(np.std(tracking) * np.sqrt(252) * 100), 4)

    def get_comparison(self) -> dict:
        """Return comparison data for the dashboard."""
        return {
            "backtest_equity": self.backtest_equity[-200:],
            "live_equity": self.live_equity[-200:],
            "tracking_error": self.compute_tracking_error(),
            "backtest_final": self.backtest_equity[-1]["equity"] if self.backtest_equity else None,
            "live_final": self.live_equity[-1]["equity"] if self.live_equity else None,
        }
