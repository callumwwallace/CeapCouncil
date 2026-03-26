"""What every user strategy subclasses.

You get lifecycle hooks, the portfolio/broker handles, helpers for orders and
``history()``, warm-up, custom charts, and alerts — everything the engine wires up for you.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.engine.broker.broker import BrokerSimulator
from app.engine.broker.order import Order, OrderSide, OrderType, TimeInForce
from app.engine.broker.execution import (
    TWAPExecutor, TWAPConfig,
    VWAPExecutor, VWAPConfig,
    IcebergExecutor, IcebergConfig,
    POVExecutor, POVConfig,
)
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
    initial_capital: float = 0.0


class StrategyBase(ABC):
    """Base class for all trading strategies.

    Rough order of operations:
    1. ``on_init()`` — once, before the first bar
    2. ``on_data(bar)`` — every bar after warm-up
    3. ``on_order_event(fill)`` — whenever something fills
    4. ``on_end()`` — after the last bar

    Use the helpers below to trade and inspect state; don't reimplement the plumbing.
    """

    def __init__(self, params: dict[str, Any] | None = None):
        self.params = params or {}
        self._context = StrategyContext()
        self._name = self.__class__.__name__

        # Ring buffer per symbol for history()
        self._history: dict[str, deque[BarData]] = {}
        self._max_history: int = 500

        # (label, every_n_bars, callback)
        self._scheduled: list[tuple[str, int, Any]] = []

        self._warmup_bars: int = 0
        self._warmup_complete: bool = False

        self._charts: dict[str, list[dict]] = {}

        self._alerts: list[dict] = []

        # Bracket legs share a group id until one of them fills
        self._bracket_groups: dict[str, dict] = {}

        self._executors: list[TWAPExecutor | VWAPExecutor | IcebergExecutor | POVExecutor] = []

    def _set_context(self, ctx: StrategyContext) -> None:
        self._context = ctx

    # --- Override these in your strategy ---

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

    def on_order_cancel(self, order: Order) -> None:
        """Called when an order is cancelled. Override to react to cancellations."""
        pass

    def on_order_reject(self, order: Order) -> None:
        """Called when an order is rejected (e.g. by a risk limit). Override to handle rejections."""
        pass

    def on_end(self) -> None:
        """Called when the backtest finishes. Override for cleanup."""
        pass

    # --- Warm-up ---

    def set_warmup(self, bars: int = 0) -> None:
        """Set warm-up period. on_data() won't be called until warm-up is complete.

        Args:
            bars: Number of bars to use for warm-up.
        """
        self._warmup_bars = bars
        self._warmup_complete = bars <= 0
        if bars > self._max_history:
            self._max_history = bars + 50

    def set_history_length(self, length: int) -> None:
        """Set the maximum number of bars retained per symbol in history().

        Call this in on_init() if your strategy needs more than the default 500 bars.
        Rebuilds any already-allocated deques with the new maxlen.
        """
        self._max_history = max(length, 1)
        # Rebuild existing deques so the new limit takes effect immediately
        for sym, dq in list(self._history.items()):
            self._history[sym] = deque(dq, maxlen=self._max_history)

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

    # --- Data ---

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
    def cash(self) -> float:
        """Current available cash."""
        return self.portfolio.cash

    @property
    def equity(self) -> float:
        """Current total portfolio value (cash + open positions)."""
        return self.portfolio.equity

    @property
    def initial_capital(self) -> float:
        """Starting capital configured for this backtest."""
        return self._context.initial_capital

    @property
    def symbols(self) -> list[str]:
        """All symbols loaded in the engine."""
        feed = self._context.data_feed
        return feed.symbols if feed else []

    def capital_per_symbol(self) -> float:
        """Equal capital allocation per loaded symbol.

        Returns total portfolio equity divided by the number of symbols.
        Use this instead of ``self.equity`` directly when sizing positions
        in multi-asset strategies so each symbol gets a fair share of
        capital regardless of how many assets are loaded.

        For single-symbol backtests this is identical to ``self.equity``.
        """
        n = max(1, len(self.symbols))
        flat_count = sum(
            1 for sym in self.symbols
            if not self.portfolio.has_position(sym)
        )
        if flat_count == 0:
            return self.equity / n
        return min(self.equity / n, self.portfolio.cash / flat_count)

    def history(self, symbol: str | None = None, length: int = 1) -> list[BarData]:
        """Get recent bars for a symbol. Default: primary symbol.

        Returns an empty list if the symbol has not been loaded or has no
        bars recorded yet — never returns None or raises KeyError.
        """
        if length <= 0:
            return []
        if symbol is None:
            feed = self._context.data_feed
            symbol = feed.primary_symbol if feed else ""
        dq = self._history.get(symbol or "", deque())
        # Convert to list so callers get a plain sequence with normal indexing.
        # Slicing is done here to avoid an extra copy when length >= len(dq).
        if length >= len(dq):
            return list(dq)
        return list(dq)[-length:]

    def _record_bar(self, bar: BarData) -> None:
        """Record bar in history (called by engine).

        Uses a deque with maxlen so old bars are evicted automatically without
        creating a new list object on every bar (the old slice approach did
        that, causing ~5 M allocations for a 500-bar window over 10 k bars).
        """
        if bar.symbol not in self._history:
            self._history[bar.symbol] = deque(maxlen=self._max_history)
        self._history[bar.symbol].append(bar)

    # --- Orders ---

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

    # --- Brackets & OCO ---

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

        # TP/SL show up only after the entry actually fills — for now you just get the entry leg
        return {"entry": entry}

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

    # --- Execution algos (TWAP, VWAP, …) ---

    def twap_order(
        self, symbol: str, quantity: float, num_slices: int = 10,
    ) -> TWAPExecutor:
        """Execute a large order using TWAP (Time-Weighted Average Price).

        Splits the order into equal-sized market orders spread over N bars.

        Args:
            symbol: Ticker to trade
            quantity: Total quantity (positive=buy, negative=sell)
            num_slices: Number of bars to spread the order across
        """
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        config = TWAPConfig(
            total_quantity=abs(quantity),
            num_slices=num_slices,
            symbol=symbol,
            side=side,
        )
        executor = TWAPExecutor(config, self.broker.submit_order)
        self._executors.append(executor)
        return executor

    def vwap_order(
        self, symbol: str, quantity: float, num_slices: int = 10,
        volume_profile: list[float] | None = None,
    ) -> VWAPExecutor:
        """Execute a large order using VWAP (Volume-Weighted Average Price).

        Distributes child orders proportional to a volume profile.

        Args:
            symbol: Ticker to trade
            quantity: Total quantity (positive=buy, negative=sell)
            num_slices: Number of bars to spread the order across
            volume_profile: Historical volume weights per slice (auto-uniform if None)
        """
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        config = VWAPConfig(
            total_quantity=abs(quantity),
            num_slices=num_slices,
            symbol=symbol,
            side=side,
            volume_profile=volume_profile,
        )
        executor = VWAPExecutor(config, self.broker.submit_order)
        self._executors.append(executor)
        return executor

    def iceberg_order(
        self, symbol: str, quantity: float, visible_quantity: float,
        limit_price: float | None = None,
    ) -> IcebergExecutor:
        """Execute a large order as an iceberg (show only a visible portion).

        Automatically submits the next visible slice when one fills.

        Args:
            symbol: Ticker to trade
            quantity: Total quantity (positive=buy, negative=sell)
            visible_quantity: Size of each visible slice
            limit_price: If set, use limit orders; otherwise market orders
        """
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        config = IcebergConfig(
            total_quantity=abs(quantity),
            visible_quantity=visible_quantity,
            symbol=symbol,
            side=side,
            limit_price=limit_price,
        )
        executor = IcebergExecutor(config, self.broker.submit_order)
        self._executors.append(executor)
        executor.start(self.time)
        return executor

    def pov_order(
        self, symbol: str, quantity: float, max_pct_of_volume: float = 0.1,
    ) -> POVExecutor:
        """Execute a large order as a percentage of each bar's volume.

        Limits execution rate to avoid excessive market impact.

        Args:
            symbol: Ticker to trade
            quantity: Total quantity (positive=buy, negative=sell)
            max_pct_of_volume: Max fraction of bar volume per slice (default 10%)
        """
        side = OrderSide.BUY if quantity > 0 else OrderSide.SELL
        config = POVConfig(
            total_quantity=abs(quantity),
            max_pct_of_volume=max_pct_of_volume,
            symbol=symbol,
            side=side,
        )
        executor = POVExecutor(config, self.broker.submit_order)
        self._executors.append(executor)
        return executor

    def _tick_executors(self, bar: BarData, timestamp: datetime) -> None:
        """Tick all active executors for the current bar (called by engine)."""
        for executor in self._executors:
            if executor.is_complete:
                continue
            if hasattr(executor, "on_bar"):
                executor.on_bar(bar, timestamp)

    def _route_executor_fill(self, fill: FillEvent) -> None:
        """Route a fill event to the executor that owns the child order."""
        order = self.broker.get_order(fill.order_id)
        if order is None:
            return
        algo = order.metadata.get("algo")
        if not algo:
            return

        for executor in self._executors:
            if executor.is_complete:
                continue
            if isinstance(executor, IcebergExecutor) and algo == "iceberg":
                executor.on_fill(fill.quantity, self.time)
                return
            if isinstance(executor, (TWAPExecutor, VWAPExecutor, POVExecutor)):
                if hasattr(executor, "on_fill"):
                    executor.on_fill(fill.quantity)
                    return

    # --- Custom charts ---

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

    # --- Alerts ---

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

    # --- Schedules ---

    def schedule(self, name: str, every_n_bars: int, callback: Any) -> None:
        """Schedule a callback to run every N bars.

        The callback receives the current bar as its only argument:
            def my_callback(bar): ...
        """
        self._scheduled.append((name, every_n_bars, callback))

    def _check_schedules(self, bar_index: int, bar: BarData) -> None:
        """Run scheduled events (called by engine)."""
        for name, interval, callback in self._scheduled:
            if bar_index > 0 and bar_index % interval == 0:
                callback(bar)

    # --- Position shortcuts ---

    def position_size(self, symbol: str) -> float:
        """Current quantity held in symbol (positive = long, negative = short)."""
        return self.portfolio.get_position_quantity(symbol)

    def is_long(self, symbol: str) -> bool:
        return self.portfolio.get_position_quantity(symbol) > 0

    def is_short(self, symbol: str) -> bool:
        return self.portfolio.get_position_quantity(symbol) < 0

    def is_flat(self, symbol: str) -> bool:
        return not self.portfolio.has_position(symbol)

    def unrealized_pnl(self, symbol: str) -> float:
        """Unrealized P&L for an open position at the current market price."""
        pos = self.portfolio.get_position(symbol)
        price = self.portfolio._current_prices.get(symbol, pos.avg_cost)
        return pos.unrealized_pnl(price)

    def avg_cost(self, symbol: str) -> float:
        """Average cost basis of the current position in symbol."""
        return self.portfolio.get_position(symbol).avg_cost
