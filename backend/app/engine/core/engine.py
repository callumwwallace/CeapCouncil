"""Engine : the main event-driven backtest runner.

Orchestrates the event loop: feeds data, processes orders, fills, signals.
Replaces Backtrader's cerebro.run() with a deterministic, extensible loop.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pandas as pd

from app.engine.core.clock import SimulationClock, ClockMode
from app.engine.core.events import (
    EventQueue,
    MarketDataEvent,
    FillEvent,
    TimerEvent,
)
from app.engine.broker.broker import BrokerSimulator, CommissionModel
from app.engine.broker.fill_models import FillModel
from app.engine.broker.slippage import SlippageModel, PercentageSlippage, VolumeAwareSlippage, NoSlippage, LiquidityTier
from app.engine.broker.spread import SpreadModel, VolatilitySpread, NoSpread
from app.engine.data.feed import DataFeed, StreamingDataFeed, BarData
from app.engine.portfolio.portfolio import Portfolio, MarginConfig
from app.engine.risk.manager import RiskManager, RiskLimits
from app.engine.strategy.base import StrategyBase, StrategyContext
from app.engine.analytics.metrics import (
    compute_metrics, derive_drawdown_series, sample_series, MetricsResult,
)


@dataclass
class EngineConfig:
    """Configuration for a backtest run."""
    initial_capital: float = 100000.0
    commission_rate: float = 0.001       # 0.1%
    commission_per_share: float = 0.0
    min_commission: float = 0.0

    # Slippage model selection
    slippage_model: str = "percentage"   # "none", "percentage", "volume_aware", "linear", "auto"
    slippage_pct: float = 0.1            # For percentage model
    liquidity_tier: str | None = None    # For volume_aware/auto: "high", "mid", "low"

    # Spread model selection
    spread_model: str = "none"           # "none", "fixed", "fixed_bps", "volatility"
    spread_value: float = 0.0            # For fixed models

    # Margin
    margin_enabled: bool = False
    allow_shorts_without_margin: bool = False  # e.g. crypto perps
    initial_margin_pct: float = 50.0
    maintenance_margin_pct: float = 25.0
    max_leverage: float = 2.0

    # Risk limits
    max_position_pct: float = 100.0
    max_drawdown_pct: float = 50.0
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None

    # Fill
    fill_at_open: bool = True
    max_fill_pct_volume: float = 0.1

    # Determinism
    random_seed: int | None = None

    # Warm-up
    warmup_bars: int = 0

    # Pattern Day Trading (US equities)
    pdt_enabled: bool = False

    # Misc
    is_crypto: bool = False
    benchmark_symbol: str | None = None
    streaming: bool = False  # Use StreamingDataFeed for lower memory usage

    _NON_DETERMINISTIC_FIELDS = {"streaming"}

    def to_hash(self) -> str:
        """Deterministic hash for reproducibility."""
        d = {k: v for k, v in self.__dict__.items() if v is not None and k not in self._NON_DETERMINISTIC_FIELDS}
        return hashlib.sha256(json.dumps(d, sort_keys=True, default=str).encode()).hexdigest()[:16]


@dataclass
class EngineResult:
    """Complete backtest results."""
    config: EngineConfig
    metrics: MetricsResult
    equity_curve: list[dict]
    drawdown_series: list[dict]
    trades: list[dict]
    orders: list[dict]
    final_value: float = 0.0
    initial_capital: float = 0.0
    total_return_pct: float = 0.0
    elapsed_ms: float = 0.0
    backtest_id: str = ""
    risk_violations: list[dict] = field(default_factory=list)

    # Rolling metrics
    rolling_sharpe: list[dict] | None = None
    rolling_sortino: list[dict] | None = None
    rolling_beta: list[dict] | None = None

    # Custom strategy charts
    custom_charts: dict = field(default_factory=dict)

    # Strategy alerts
    alerts: list[dict] = field(default_factory=list)

    # Full event log for audit trail
    event_log: list[dict] = field(default_factory=list)

    @staticmethod
    def _py(val):
        """Convert numpy scalars to plain Python types for JSON/DB serialization."""
        if val is None:
            return None
        import numpy as _np
        if isinstance(val, (_np.integer,)):
            return int(val)
        if isinstance(val, (_np.floating,)):
            v = float(val)
            if _np.isnan(v) or _np.isinf(v):
                return None
            return v
        if isinstance(val, float):
            import math
            if math.isnan(val) or math.isinf(val):
                return None
        return val

    def to_results_dict(self) -> dict:
        """Convert to dict matching existing frontend BacktestResults contract."""
        sampled_equity = sample_series(self.equity_curve, max_points=200)
        sampled_dd = derive_drawdown_series(sampled_equity)
        m = self.metrics
        p = self._py

        return {
            "final_value": p(round(self.final_value, 2)),
            "initial_capital": p(self.initial_capital),
            "total_return_pct": p(round(self.total_return_pct, 4)),
            "sharpe_ratio": p(m.sharpe_ratio),
            "max_drawdown_pct": p(round(m.max_drawdown_pct, 4)),
            "total_trades": p(m.total_trades),
            "win_rate": p(m.win_rate),
            "trades": self.trades,
            "equity_curve": sampled_equity,
            "drawdown_series": sampled_dd,
            "benchmark_return": None,
            "sortino_ratio": p(m.sortino_ratio),
            "profit_factor": p(m.profit_factor),
            "avg_trade_duration": p(m.avg_trade_duration),
            "max_consecutive_losses": p(m.max_consecutive_losses),
            "calmar_ratio": p(m.calmar_ratio),
            "exposure_pct": p(m.exposure_pct),
            # Extended metrics
            "orders": self.orders,
            "expectancy": p(m.expectancy),
            "volatility_annual": p(m.volatility_annual),
            "information_ratio": p(m.information_ratio),
            "beta": p(m.beta),
            "alpha": p(m.alpha),
            "total_commission": p(m.total_commission),
            "total_slippage": p(m.total_slippage),
            "total_spread_cost": p(m.total_spread_cost),
            "cost_as_pct_of_pnl": p(m.cost_as_pct_of_pnl),
            "rolling_sharpe": m.rolling_sharpe,
            "rolling_sortino": m.rolling_sortino,
            "rolling_beta": m.rolling_beta,
            "var_95": p(m.var_95),
            "cvar_95": p(m.cvar_95),
            "var_99": p(m.var_99),
            "cvar_99": p(m.cvar_99),
            "deflated_sharpe_ratio": p(m.deflated_sharpe_ratio),
            "robustness_score": p(m.robustness_score),
            "risk_violations": self.risk_violations,
            "custom_charts": self.custom_charts,
            "alerts": self.alerts,
        }


class Engine:
    """Event-driven backtesting engine.

    Usage:
        engine = Engine(config)
        engine.add_data("AAPL", df)
        engine.set_strategy(my_strategy)
        result = engine.run()
    """

    def __init__(self, config: EngineConfig | None = None):
        self.config = config or EngineConfig()
        self._data_feed = StreamingDataFeed() if self.config.streaming else DataFeed()
        self._strategy: StrategyBase | None = None
        self._event_queue = EventQueue()
        self._clock = SimulationClock(ClockMode.BACKTEST)

        # Build components from config
        self._spread_model = self._build_spread_model()
        self._slippage_model = self._build_slippage_model()
        self._fill_model = FillModel(
            spread_model=self._spread_model,
            slippage_model=self._slippage_model,
            fill_at_open=self.config.fill_at_open,
            max_fill_pct_of_volume=self.config.max_fill_pct_volume,
        )
        self._commission = CommissionModel(
            rate=self.config.commission_rate,
            per_share=self.config.commission_per_share,
            min_commission=self.config.min_commission,
        )
        self._broker = BrokerSimulator(
            fill_model=self._fill_model,
            commission=self._commission,
            initial_cash=self.config.initial_capital,
        )

        margin = MarginConfig(
            enabled=self.config.margin_enabled,
            initial_margin_pct=self.config.initial_margin_pct,
            maintenance_margin_pct=self.config.maintenance_margin_pct,
            max_leverage=self.config.max_leverage,
        )
        self._portfolio = Portfolio(
            initial_cash=self.config.initial_capital,
            margin_config=margin,
        )

        risk_limits = RiskLimits(
            max_position_pct=self.config.max_position_pct,
            max_drawdown_pct=self.config.max_drawdown_pct,
            stop_loss_pct=self.config.stop_loss_pct,
            take_profit_pct=self.config.take_profit_pct,
            pdt_enabled=self.config.pdt_enabled,
            allow_shorts_without_margin=self.config.allow_shorts_without_margin,
        )
        self._risk_manager = RiskManager(limits=risk_limits)

        # Wire up callbacks
        self._broker.set_fill_callback(self._on_fill)
        self._broker.set_order_submit_callback(self._on_order_submit)

        def _pre_submit_check(order):
            price = self._portfolio._current_prices.get(order.symbol, 1.0)
            if price <= 0:
                price = 1.0
            return self._risk_manager.check_order(order, self._portfolio, price)

        self._broker.set_pre_submit_check(_pre_submit_check)

        # Event log for audit
        self._event_log: list[dict] = []

    def add_data(self, symbol: str, df: pd.DataFrame, corporate_actions=None) -> None:
        """Add market data for a symbol.
        
        Args:
            symbol: Ticker/symbol identifier.
            df: DataFrame with OHLCV data.
            corporate_actions: Optional CorporateActionsManager to apply adjustments.
        """
        if corporate_actions is not None:
            df = corporate_actions.apply_all(df, symbol)
        self._data_feed.add_symbol(symbol, df)

    def set_strategy(self, strategy: StrategyBase) -> None:
        """Set the strategy to run."""
        self._strategy = strategy

    def run(self) -> EngineResult:
        """Execute the backtest. Returns complete results."""
        start_time = time.monotonic()

        if self._strategy is None:
            raise ValueError("No strategy set. Call set_strategy() first.")
        if not self._data_feed.symbols:
            raise ValueError("No data loaded. Call add_data() first.")

        # Initialize strategy context
        ctx = StrategyContext(
            portfolio=self._portfolio,
            broker=self._broker,
            data_feed=self._data_feed,
        )
        self._strategy._set_context(ctx)
        self._strategy.on_init()

        # Apply warm-up from config or strategy
        if self.config.warmup_bars > 0 and self._strategy._warmup_bars == 0:
            self._strategy.set_warmup(bars=self.config.warmup_bars)

        # Main event loop : iterate through all bars
        bar_index = 0
        last_bar_group: list[MarketDataEvent] = []
        for bar_group in self._data_feed.iterate():
            last_bar_group = bar_group
            timestamp = bar_group[0].timestamp
            self._clock.advance(timestamp)
            ctx.current_time = timestamp
            ctx.bar_index = bar_index

            # Update prices
            prices = {ev.symbol: ev.close for ev in bar_group}
            self._portfolio.update_prices(prices)

            # Log market data events
            for event in bar_group:
                self._event_log.append({
                    "type": "market_data",
                    "timestamp": event.timestamp.isoformat(),
                    "symbol": event.symbol,
                    "open": event.open,
                    "high": event.high,
                    "low": event.low,
                    "close": event.close,
                    "volume": event.volume,
                })

            # Process pending orders against new bars
            for event in bar_group:
                bar = BarData(
                    symbol=event.symbol,
                    timestamp=event.timestamp,
                    open=event.open,
                    high=event.high,
                    low=event.low,
                    close=event.close,
                    volume=event.volume,
                    bar_index=event.bar_index,
                )
                self._broker.process_bar(bar, timestamp)

            # Check risk limits
            violations = self._risk_manager.on_bar(self._portfolio, timestamp)
            if violations:
                for v in violations:
                    self._event_log.append({
                        "type": "risk_violation",
                        "timestamp": timestamp.isoformat(),
                        "rule": v.rule,
                        "description": v.description,
                        "action": v.action,
                    })
                    if v.action == "liquidate":
                        self._liquidate_all(timestamp)

            # Call strategy on_data for primary symbol
            primary_event = bar_group[0]
            primary_bar = BarData(
                symbol=primary_event.symbol,
                timestamp=primary_event.timestamp,
                open=primary_event.open,
                high=primary_event.high,
                low=primary_event.low,
                close=primary_event.close,
                volume=primary_event.volume,
                bar_index=primary_event.bar_index,
            )

            # Record bar in history
            for event in bar_group:
                b = BarData(
                    symbol=event.symbol,
                    timestamp=event.timestamp,
                    open=event.open,
                    high=event.high,
                    low=event.low,
                    close=event.close,
                    volume=event.volume,
                    bar_index=event.bar_index,
                )
                self._strategy._record_bar(b)

            # Execute strategy logic (skip during warm-up).
            # Run on_data even when halted so the strategy can submit closing orders;
            # pre_submit_check will reject new opens but allow closing/reducing positions.
            if self._strategy._check_warmup(bar_index):
                self._strategy.on_data(primary_bar)

            # Check scheduled events
            self._strategy._check_schedules(bar_index)

            # Margin checks (before equity recording so the curve is consistent)
            if self._portfolio.margin.enabled:
                self._portfolio.accrue_borrow_fees(timestamp)
                if self._portfolio.check_margin_call(timestamp):
                    self._liquidate_all(timestamp)

            # Record equity after all state changes for this bar
            self._portfolio.record_equity(timestamp)

            bar_index += 1

        last_timestamp = self._clock.now
        if last_bar_group:
            for event in last_bar_group:
                bar = BarData(
                    symbol=event.symbol,
                    timestamp=event.timestamp,
                    open=event.open, high=event.high,
                    low=event.low, close=event.close,
                    volume=event.volume, bar_index=event.bar_index,
                )
                self._broker.process_bar(bar, last_timestamp)

            for symbol, pos in list(self._portfolio._positions.items()):
                if not pos.is_flat:
                    from app.engine.broker.order import Order as _Order, OrderSide as _Side, OrderType as _OType
                    side = _Side.SELL if pos.is_long else _Side.BUY
                    order = _Order(
                        symbol=symbol,
                        side=side,
                        order_type=_OType.MARKET,
                        quantity=abs(pos.quantity),
                    )
                    self._broker.submit_order(order, last_timestamp)
                    for event in last_bar_group:
                        if event.symbol == symbol:
                            bar = BarData(
                                symbol=event.symbol,
                                timestamp=event.timestamp,
                                open=event.open, high=event.high,
                                low=event.low, close=event.close,
                                volume=event.volume, bar_index=event.bar_index,
                            )
                            self._broker.process_bar(bar, last_timestamp)
                            break

        self._strategy.on_end()
        elapsed = (time.monotonic() - start_time) * 1000

        # Compute metrics
        equity_curve = [{"date": p.date, "equity": p.equity} for p in self._portfolio.equity_curve]
        trades_list = [t.to_dict() for t in self._portfolio.trades]
        orders_list = [o.to_dict() for o in self._broker.all_orders]

        metrics = compute_metrics(
            equity_curve=equity_curve,
            trades=trades_list,
            initial_capital=self.config.initial_capital,
        )

        risk_violation_dicts = [
            {"timestamp": v.timestamp.isoformat(), "rule": v.rule,
             "description": v.description, "action": v.action}
            for v in self._risk_manager.violations
        ]

        # Collect custom charts and alerts from strategy
        custom_charts = self._strategy.get_charts() if self._strategy else {}
        alerts = self._strategy.get_alerts() if self._strategy else []

        return EngineResult(
            config=self.config,
            metrics=metrics,
            equity_curve=equity_curve,
            drawdown_series=derive_drawdown_series(equity_curve),
            trades=trades_list,
            orders=orders_list,
            final_value=round(self._portfolio.equity, 2),
            initial_capital=self.config.initial_capital,
            total_return_pct=round(self._portfolio.total_return_pct, 4),
            elapsed_ms=round(elapsed, 2),
            backtest_id=self.config.to_hash(),
            risk_violations=risk_violation_dicts,
            rolling_sharpe=metrics.rolling_sharpe,
            rolling_sortino=metrics.rolling_sortino,
            rolling_beta=metrics.rolling_beta,
            custom_charts=custom_charts,
            alerts=alerts,
            event_log=self._event_log,
        )

    def _on_order_submit(self, order: "Order", timestamp: datetime) -> None:
        """Log order submission events."""
        self._event_log.append({
            "type": "order_submit",
            "timestamp": timestamp.isoformat(),
            "order_id": order.order_id,
            "symbol": order.symbol,
            "side": order.side.value,
            "order_type": order.order_type.value,
            "quantity": order.quantity,
        })

    def _on_fill(self, fill: FillEvent) -> None:
        """Handle fill events : update portfolio and notify strategy."""
        completed_trades = self._portfolio.on_fill(fill)
        if self._strategy:
            self._strategy.on_order_event(fill)
            self._strategy._handle_bracket_fill(fill)
        # Log event
        self._event_log.append({
            "type": "fill",
            "timestamp": fill.timestamp.isoformat(),
            "order_id": fill.order_id,
            "symbol": fill.symbol,
            "side": fill.side,
            "quantity": fill.quantity,
            "price": fill.fill_price,
            "commission": fill.commission,
        })

    def _liquidate_all(self, timestamp: datetime) -> None:
        """Emergency liquidation : close all positions."""
        for symbol, pos in self._portfolio._positions.items():
            if not pos.is_flat:
                from app.engine.broker.order import Order, OrderSide, OrderType
                side = OrderSide.SELL if pos.is_long else OrderSide.BUY
                order = Order(
                    symbol=symbol,
                    side=side,
                    order_type=OrderType.MARKET,
                    quantity=abs(pos.quantity),
                )
                self._broker.submit_order(order, timestamp)

    def _build_spread_model(self) -> SpreadModel:
        cfg = self.config
        if cfg.spread_model == "none":
            return NoSpread()
        elif cfg.spread_model == "volatility":
            return VolatilitySpread(is_crypto=cfg.is_crypto)
        else:
            from app.engine.broker.spread import FixedSpread, FixedBpsSpread
            if cfg.spread_model == "fixed_bps":
                return FixedBpsSpread(bps=cfg.spread_value)
            return FixedSpread(spread=cfg.spread_value)

    def _build_slippage_model(self) -> SlippageModel:
        cfg = self.config
        if cfg.slippage_model == "none":
            return NoSlippage()
        elif cfg.slippage_model in ("volume_aware", "auto"):
            tier = LiquidityTier.HIGH
            if cfg.liquidity_tier:
                try:
                    tier = LiquidityTier(cfg.liquidity_tier)
                except ValueError:
                    tier = LiquidityTier.HIGH
            return VolumeAwareSlippage(tier=tier)
        elif cfg.slippage_model == "linear":
            from app.engine.broker.slippage import LinearSlippage
            return LinearSlippage()
        return PercentageSlippage(pct=cfg.slippage_pct)
