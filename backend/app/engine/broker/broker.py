"""Broker simulator: manages orders and produces fills.

Processes pending orders against incoming market data events.
Handles order lifecycle, commission, and integrates spread/slippage models.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from app.engine.broker.order import (
    Order, OrderSide, OrderType, OrderStatus, TimeInForce,
)
from app.engine.broker.fill_models import FillModel, FillResult
from app.engine.broker.slippage import SlippageModel, NoSlippage
from app.engine.broker.spread import SpreadModel, NoSpread
from app.engine.core.events import FillEvent
from app.engine.data.feed import BarData


@dataclass
class CommissionModel:
    """Commission calculation."""
    rate: float = 0.001         # 0.1% per trade
    min_commission: float = 0.0
    per_share: float = 0.0      # Alternative: per-share commission

    def compute(self, price: float, quantity: float) -> float:
        if self.per_share > 0:
            return max(quantity * self.per_share, self.min_commission)
        return max(price * quantity * self.rate, self.min_commission)


class BrokerSimulator:
    """Simulates a broker for backtesting.

    Receives orders from strategies, processes them against market data,
    produces fills, and tracks commissions.
    """

    def __init__(
        self,
        fill_model: FillModel | None = None,
        commission: CommissionModel | None = None,
        initial_cash: float = 100000.0,
    ):
        self.fill_model = fill_model or FillModel()
        self.commission = commission or CommissionModel()
        self.initial_cash = initial_cash

        # Order management
        self._pending_orders: list[Order] = []
        self._all_orders: list[Order] = []
        self._order_map: dict[str, Order] = {}

        # Average volume tracking for spread/slippage
        self._avg_volumes: dict[str, float] = {}
        self._volume_history: dict[str, list[float]] = defaultdict(list)

        # Fill callback (set by engine to notify portfolio)
        self._on_fill: Callable[[FillEvent], None] | None = None
        # Order submit callback (set by engine for audit logging)
        self._on_order_submit: Callable[[Order, datetime], None] | None = None
        # Pre-submit check (order) -> (allowed, reason). If returns (False, _), order is rejected.
        self._pre_submit_check: Callable[[Order], tuple[bool, str]] | None = None

    def set_fill_callback(self, callback: Callable[[FillEvent], None]) -> None:
        self._on_fill = callback

    def set_order_submit_callback(self, callback: Callable[[Order, datetime], None]) -> None:
        self._on_order_submit = callback

    def set_pre_submit_check(self, callback: Callable[[Order], tuple[bool, str]] | None) -> None:
        """Set optional pre-submit validator. If it returns (False, reason), order is rejected."""
        self._pre_submit_check = callback

    def submit_order(self, order: Order, timestamp: datetime) -> Order:
        """Submit a new order. Returns the order with SUBMITTED or REJECTED status."""
        order.created_at = timestamp
        if self._pre_submit_check:
            allowed, reason = self._pre_submit_check(order)
            if not allowed:
                order.reject(reason)
                self._all_orders.append(order)
                self._order_map[order.order_id] = order
                if self._on_order_submit:
                    self._on_order_submit(order, timestamp)
                return order
        order.submit(timestamp)
        self._pending_orders.append(order)
        self._all_orders.append(order)
        self._order_map[order.order_id] = order
        if self._on_order_submit:
            self._on_order_submit(order, timestamp)
        return order

    def cancel_order(self, order_id: str, timestamp: datetime) -> bool:
        """Cancel a pending order. Returns True if cancelled."""
        order = self._order_map.get(order_id)
        if order and order.is_active:
            order.cancel(timestamp)
            self._pending_orders = [o for o in self._pending_orders if o.order_id != order_id]
            return True
        return False

    def cancel_all(self, symbol: str | None = None, timestamp: datetime | None = None) -> int:
        """Cancel all pending orders, optionally filtered by symbol."""
        ts = timestamp or datetime.now(timezone.utc)
        cancelled = 0
        remaining: list[Order] = []
        for order in self._pending_orders:
            if symbol is None or order.symbol == symbol:
                order.cancel(ts)
                cancelled += 1
            else:
                remaining.append(order)
        self._pending_orders = remaining
        return cancelled

    def process_bar(self, bar: BarData, timestamp: datetime) -> list[FillEvent]:
        """Process all pending orders against a new bar.

        When orders have intrabar tick indices (from IntrabarSimulator),
        fills are sorted by tick index so that the order triggered first
        within the bar is processed first. This correctly handles cases
        like a stop-loss and take-profit both within the same bar.

        Returns list of fills produced.
        """
        # Update volume history for slippage calculations
        self._volume_history[bar.symbol].append(bar.volume)
        recent = self._volume_history[bar.symbol][-20:]
        self._avg_volumes[bar.symbol] = sum(recent) / len(recent) if recent else 0

        # Phase 1: evaluate all orders for this symbol and collect results
        avg_vol = self._avg_volumes.get(bar.symbol)
        candidates: list[tuple[Order, FillResult]] = []
        still_pending: list[Order] = []

        for order in self._pending_orders:
            if order.symbol != bar.symbol:
                still_pending.append(order)
                continue
            if not order.is_active:
                continue

            result = self.fill_model.try_fill(order, bar, avg_vol)
            if result.filled and result.fill_quantity > 0:
                candidates.append((order, result))
            else:
                still_pending.append(order)

        # Phase 2: sort by intrabar tick index for correct fill sequencing.
        # Orders without a tick index (market, MOO, MOC) get index -1 so
        # they fill before conditional orders, preserving existing behavior.
        candidates.sort(key=lambda c: c[1].intrabar_tick_index if c[1].intrabar_tick_index is not None else -1)

        # Phase 3: execute fills in sequence
        fills: list[FillEvent] = []
        for order, result in candidates:
            if not order.is_active:
                continue

            comm = self.commission.compute(result.fill_price, result.fill_quantity)
            order.fill(
                quantity=result.fill_quantity,
                price=result.fill_price,
                commission=comm,
                slippage=result.slippage,
                timestamp=timestamp,
            )

            fill_event = FillEvent(
                timestamp=timestamp,
                order_id=order.order_id,
                symbol=order.symbol,
                side=order.side.value,
                quantity=result.fill_quantity,
                fill_price=result.fill_price,
                commission=comm,
                slippage=result.slippage,
            )
            fills.append(fill_event)

            if self._on_fill:
                self._on_fill(fill_event)

            if order.is_active:
                still_pending.append(order)

        self._pending_orders = still_pending
        return fills

    def cancel_day_orders(self, timestamp: datetime) -> int:
        """Cancel all DAY orders (called at session close)."""
        cancelled = 0
        remaining: list[Order] = []
        for order in self._pending_orders:
            if order.time_in_force == TimeInForce.DAY and order.is_active:
                order.cancel(timestamp)
                cancelled += 1
            else:
                remaining.append(order)
        self._pending_orders = remaining
        return cancelled

    def get_order(self, order_id: str) -> Order | None:
        return self._order_map.get(order_id)

    @property
    def pending_orders(self) -> list[Order]:
        return [o for o in self._pending_orders if o.is_active]

    @property
    def all_orders(self) -> list[Order]:
        return list(self._all_orders)

    @property
    def filled_orders(self) -> list[Order]:
        return [o for o in self._all_orders if o.status == OrderStatus.FILLED]


class LatencySimulator:
    """Simulates order processing latency.
    
    Delays order execution by a configurable number of bars/ticks
    to model network and exchange processing delays.
    """

    def __init__(self, latency_bars: int = 0, latency_ms: float = 0):
        self.latency_bars = latency_bars  # Delay execution by N bars
        self.latency_ms = latency_ms      # Simulated milliseconds delay
        self._pending_queue: list[tuple[int, "Order"]] = []  # (release_bar, order)

    def submit(self, order: "Order", current_bar: int) -> "Order" | None:
        """Submit an order with latency. Returns order if immediately released, else None."""
        if self.latency_bars <= 0:
            return order  # No delay
        release_bar = current_bar + self.latency_bars
        self._pending_queue.append((release_bar, order))
        return None

    def get_released(self, current_bar: int) -> list["Order"]:
        """Get orders that have completed their latency delay."""
        released = [order for bar, order in self._pending_queue if bar <= current_bar]
        self._pending_queue = [(bar, order) for bar, order in self._pending_queue if bar > current_bar]
        return released

    @property
    def pending_count(self) -> int:
        return len(self._pending_queue)
