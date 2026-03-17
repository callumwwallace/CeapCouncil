"""Base class for user strategies.

Provides lifecycle hooks, access to portfolio/broker, order helpers,
data history access, indicators, consolidators, custom charts,
notifications, and warm-up period support.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.engine.broker.broker import BrokerSimulator
from app.engine.broker.order import Order, OrderSide, OrderType, TimeInForce
from app.engine.core.events import FillEvent, MarketDataEvent
from app.engine.data.feed import BarData, DataFeed
from app.engine.portfolio.portfolio import Portfolio


@dataclass
class StrategyContext:
    """Runtime context injected into the strategy by the engine."""
    portfolio: Portfolio | None = None
    broker: BrokerSimulator | None = None
    data_feed: DataFeed | None = None
    current_time: datetime | None = None
    bar_index: int = 0


class StrategyBase(ABC):
    """Base class for all trading strategies.

    Lifecycle:
    1. on_init() : called once before backtest starts
    2. on_data(bar) : called for each new bar (after warm-up)
    3. on_order_event(fill) : called when an order fills
    4. on_end() : called when backtest completes

    Strategies use helper methods to submit orders and query state.
    """

    def __init__(self, params: dict[str, Any] | None = None):
        self.params = params or {}
        self._context = StrategyContext()
        self._name = self.__class__.__name__

        # Data history (per-symbol ring buffer)
        self._history: dict[str, list[BarData]] = {}
        self._max_history: int = 500

        # Scheduled events
        self._scheduled: list[tuple[str, int, Any]] = []  # (name, every_n_bars, callback)

        # Warm-up period
        self._warmup_bars: int = 0
        self._warmup_complete: bool = False

        # Custom charts
        self._charts: dict[str, list[dict]] = {}

        # Notifications
        self._alerts: list[dict] = []

        # Bracket order tracking
        self._bracket_groups: dict[str, dict] = {}

        # Object store
        self._store: dict[str, Any] = {}

    def _set_context(self, ctx: StrategyContext) -> None:
        self._context = ctx

    # -- Lifecycle hooks (override these) --

    def on_init(self) -> None:
        """Called once before the backtest starts. Set up indicators here."""
        pass

    @abstractmethod
    def on_data(self, bar: BarData) -> None:
        """Called on each new bar. Implement trading logic here."""
        ...

    def on_order_event(self, fill: FillEvent) -> None:
        """Called when an order fills. Override for fill-based logic."""
        pass

    def on_end(self) -> None:
        """Called when the backtest finishes. Override for cleanup."""
        pass

    # -- Warm-up period API --

    def set_warmup(self, bars: int = 0) -> None:
        """Set warm-up period. on_data() won't be called until warm-up is complete.

        Args:
            bars: Number of bars to use for warm-up.
        """
        self._warmup_bars = bars
        self._warmup_complete = bars <= 0

    @property
    def is_warming_up(self) -> bool:
        return not self._warmup_complete

    def _check_warmup(self, bar_index: int) -> bool:
        """Check if warm-up period is complete. Returns True if strategy should run."""
        if self._warmup_complete:
            return True
        if bar_index >= self._warmup_bars:
            self._warmup_complete = True
            return True
        return False

    # -- Data access --

    @property
    def portfolio(self) -> Portfolio:
        assert self._context.portfolio is not None
        return self._context.portfolio

    @property
    def broker(self) -> BrokerSimulator:
        assert self._context.broker is not None
        return self._context.broker

    @property
    def time(self) -> datetime:
        assert self._context.current_time is not None
        return self._context.current_time

    @property
    def bar_index(self) -> int:
        return self._context.bar_index

    @property
    def store(self) -> dict[str, Any]:
        """Simple key-value store for persisting state between bars."""
        return self._store

    def history(self, symbol: str | None = None, length: int = 1) -> list[BarData]:
        """Get recent bars for a symbol. Default: primary symbol."""
        if symbol is None:
            feed = self._context.data_feed
            symbol = feed.primary_symbol if feed else ""
        bars = self._history.get(symbol or "", [])
        return bars[-length:] if length < len(bars) else bars

    def _record_bar(self, bar: BarData) -> None:
        """Record bar in history (called by engine)."""
        if bar.symbol not in self._history:
            self._history[bar.symbol] = []
        hist = self._history[bar.symbol]
        hist.append(bar)
        if len(hist) > self._max_history:
            self._history[bar.symbol] = hist[-self._max_history:]

    # -- Order helpers --

    def market_order(self, symbol: str, quantity: float, **kwargs) -> Order:
        """Submit a market order."""
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        order = Order(
            symbol=symbol,
            side=side,
            order_type=OrderType.MARKET,
            quantity=abs(quantity),
            **kwargs,
        )
        return self.broker.submit_order(order, self.time)

    def limit_order(self, symbol: str, quantity: float, price: float, **kwargs) -> Order:
        """Submit a limit order."""
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        order = Order(
            symbol=symbol,
            side=side,
            order_type=OrderType.LIMIT,
            quantity=abs(quantity),
            limit_price=price,
            **kwargs,
        )
        return self.broker.submit_order(order, self.time)

    def stop_order(self, symbol: str, quantity: float, stop_price: float, **kwargs) -> Order:
        """Submit a stop market order."""
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        order = Order(
            symbol=symbol,
            side=side,
            order_type=OrderType.STOP_MARKET,
            quantity=abs(quantity),
            stop_price=stop_price,
            **kwargs,
        )
        return self.broker.submit_order(order, self.time)

    def stop_limit_order(
        self, symbol: str, quantity: float, stop_price: float, limit_price: float, **kwargs
    ) -> Order:
        """Submit a stop limit order."""
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        order = Order(
            symbol=symbol,
            side=side,
            order_type=OrderType.STOP_LIMIT,
            quantity=abs(quantity),
            stop_price=stop_price,
            limit_price=limit_price,
            **kwargs,
        )
        return self.broker.submit_order(order, self.time)

    def trailing_stop(
        self, symbol: str, quantity: float,
        trail_amount: float | None = None, trail_percent: float | None = None, **kwargs
    ) -> Order:
        """Submit a trailing stop order."""
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        order = Order(
            symbol=symbol,
            side=side,
            order_type=OrderType.TRAILING_STOP,
            quantity=abs(quantity),
            trail_amount=trail_amount,
            trail_percent=trail_percent,
            **kwargs,
        )
        return self.broker.submit_order(order, self.time)

    # -- Bracket / Combo orders --

    def bracket_order(
        self, symbol: str, quantity: float,
        take_profit_price: float, stop_loss_price: float,
        entry_price: float | None = None,
    ) -> dict[str, Order]:
        """Submit a bracket order (entry + take profit + stop loss).

        If entry_price is None, entry is a market order.
        The stop loss and take profit are linked : when one fills, the other is cancelled.

        Returns dict with keys: 'entry', 'take_profit', 'stop_loss'
        """
        if entry_price is not None:
            entry = self.limit_order(symbol, quantity, entry_price)
        else:
            entry = self.market_order(symbol, quantity)

        group_id = entry.order_id
        entry.metadata["bracket_group"] = group_id
        entry.metadata["bracket_role"] = "entry"

        self._bracket_groups[group_id] = {
            "entry": entry.order_id,
            "take_profit": None,
            "stop_loss": None,
            "_pending_tp_price": take_profit_price,
            "_pending_sl_price": stop_loss_price,
            "_symbol": symbol,
            "_quantity": quantity,
        }

        return {"entry": entry, "take_profit": None, "stop_loss": None}

    def oco_order(
        self, symbol: str,
        order_a: dict, order_b: dict,
    ) -> dict[str, Order]:
        """One-Cancels-Other: submit two orders, cancel the other when one fills.

        Each order dict: {"quantity", "price", "order_type": "limit"|"stop"}
        """
        if order_a.get("order_type") == "stop":
            a = self.stop_order(symbol, order_a["quantity"], order_a["price"])
        else:
            a = self.limit_order(symbol, order_a["quantity"], order_a["price"])

        if order_b.get("order_type") == "stop":
            b = self.stop_order(symbol, order_b["quantity"], order_b["price"])
        else:
            b = self.limit_order(symbol, order_b["quantity"], order_b["price"])

        group_id = a.order_id
        a.metadata["oco_group"] = group_id
        a.metadata["oco_other"] = b.order_id
        b.metadata["oco_group"] = group_id
        b.metadata["oco_other"] = a.order_id

        return {"order_a": a, "order_b": b}

    def _handle_bracket_fill(self, fill: FillEvent) -> None:
        """Handle bracket/OCO order management on fills."""
        order = self.broker.get_order(fill.order_id)
        if order is None:
            return

        # OCO handling
        if "oco_other" in order.metadata and order.status.value == "filled":
            other_id = order.metadata["oco_other"]
            self.broker.cancel_order(other_id, self.time)

        if "bracket_role" not in order.metadata:
            return

        role = order.metadata["bracket_role"]
        group_id = order.metadata.get("bracket_group")
        if not group_id or group_id not in self._bracket_groups:
            return
        group = self._bracket_groups[group_id]

        if role == "entry" and order.status.value == "filled":
            symbol = group["_symbol"]
            quantity = group["_quantity"]
            tp_price = group["_pending_tp_price"]
            sl_price = group["_pending_sl_price"]

            tp = self.limit_order(symbol, -quantity, tp_price)
            sl = self.stop_order(symbol, -quantity, sl_price)

            tp.metadata["bracket_group"] = group_id
            tp.metadata["bracket_role"] = "take_profit"
            sl.metadata["bracket_group"] = group_id
            sl.metadata["bracket_role"] = "stop_loss"

            group["take_profit"] = tp.order_id
            group["stop_loss"] = sl.order_id

        elif role in ("take_profit", "stop_loss") and order.status.value == "filled":
            for r, oid in group.items():
                if r.startswith("_") or r == "entry":
                    continue
                if oid and oid != fill.order_id:
                    self.broker.cancel_order(oid, self.time)

    def close_position(self, symbol: str) -> Order | None:
        """Close entire position in a symbol."""
        qty = self.portfolio.get_position_quantity(symbol)
        if abs(qty) < 1e-9:
            return None
        return self.market_order(symbol, -qty)

    def cancel_all_orders(self, symbol: str | None = None) -> int:
        """Cancel all pending orders."""
        return self.broker.cancel_all(symbol, self.time)

    # -- Custom charting API --

    def plot(self, chart_name: str, series_name: str, value: float) -> None:
        """Plot a value on a custom chart.

        Usage: self.plot("My Indicator", "RSI", rsi_value)
        """
        if chart_name not in self._charts:
            self._charts[chart_name] = []
        self._charts[chart_name].append({
            "date": self.time.isoformat() if self._context.current_time else None,
            "series": series_name,
            "value": value,
        })

    def get_charts(self) -> dict[str, list[dict]]:
        """Get all custom chart data. Called by engine after backtest."""
        return dict(self._charts)

    # -- Notifications --

    def notify(self, message: str, level: str = "info", data: dict | None = None) -> None:
        """Send a notification/alert.

        Args:
            message: Alert message text
            level: "info", "warning", or "critical"
            data: Optional extra data
        """
        alert = {
            "timestamp": self.time.isoformat() if self._context.current_time else None,
            "level": level,
            "message": message,
            "data": data,
        }
        self._alerts.append(alert)

    def get_alerts(self) -> list[dict]:
        """Get all alerts generated during the backtest."""
        return list(self._alerts)

    # -- Scheduling --

    def schedule(self, name: str, every_n_bars: int, callback: Any) -> None:
        """Schedule a callback to run every N bars."""
        self._scheduled.append((name, every_n_bars, callback))

    def _check_schedules(self, bar_index: int) -> None:
        """Run scheduled events (called by engine)."""
        for name, interval, callback in self._scheduled:
            if bar_index > 0 and bar_index % interval == 0:
                callback()

    # -- Position helpers --

    def position_size(self, symbol: str) -> float:
        return self.portfolio.get_position_quantity(symbol)

    def is_long(self, symbol: str) -> bool:
        return self.portfolio.get_position_quantity(symbol) > 0

    def is_short(self, symbol: str) -> bool:
        return self.portfolio.get_position_quantity(symbol) < 0

    def is_flat(self, symbol: str) -> bool:
        return not self.portfolio.has_position(symbol)
