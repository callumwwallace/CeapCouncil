"""Execution algorithms : algorithmic order execution for reducing market impact.

Supports:
- TWAP (Time-Weighted Average Price) : spread order evenly over time
- VWAP execution : execute proportional to historical volume profile
- Iceberg orders : show only a visible portion at a time
- PercentOfVolume : limit execution rate to % of bar volume
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable

from app.engine.broker.order import Order, OrderSide, OrderType
from app.engine.data.feed import BarData


class ExecAlgoType(str, Enum):
    TWAP = "twap"
    VWAP = "vwap"
    ICEBERG = "iceberg"
    POV = "percent_of_volume"


@dataclass
class TWAPConfig:
    """TWAP configuration."""
    total_quantity: float
    num_slices: int = 10
    symbol: str = ""
    side: OrderSide = OrderSide.BUY


@dataclass
class VWAPConfig:
    """VWAP execution configuration."""
    total_quantity: float
    num_slices: int = 10
    symbol: str = ""
    side: OrderSide = OrderSide.BUY
    volume_profile: list[float] | None = None  # historical volume weights per slice


@dataclass
class IcebergConfig:
    """Iceberg order configuration."""
    total_quantity: float
    visible_quantity: float
    symbol: str = ""
    side: OrderSide = OrderSide.BUY
    limit_price: float | None = None


@dataclass
class POVConfig:
    """Percent of Volume configuration."""
    total_quantity: float
    max_pct_of_volume: float = 0.1  # max 10% of bar volume
    symbol: str = ""
    side: OrderSide = OrderSide.BUY


class TWAPExecutor:
    """Time-Weighted Average Price executor.

    Splits a large order into equal-sized child orders spread over N bars.
    """

    def __init__(self, config: TWAPConfig, submit_fn: Callable[[Order, datetime], Order]):
        self.config = config
        self._submit = submit_fn
        self._slice_qty = config.total_quantity / config.num_slices
        self._filled_qty = 0.0
        self._slices_sent = 0
        self._child_orders: list[Order] = []
        self._complete = False

    def on_bar(self, bar: BarData, timestamp: datetime) -> Order | None:
        """Call each bar to send next slice. Returns child order or None."""
        if self._complete or bar.symbol != self.config.symbol:
            return None
        if self._slices_sent >= self.config.num_slices:
            self._complete = True
            return None

        remaining = self.config.total_quantity - self._filled_qty
        qty = min(self._slice_qty, remaining)
        if qty <= 0:
            self._complete = True
            return None

        signed_qty = qty if self.config.side == OrderSide.BUY else -qty
        order = Order(
            symbol=self.config.symbol,
            side=self.config.side,
            order_type=OrderType.MARKET,
            quantity=qty,
            metadata={"algo": "twap", "slice": self._slices_sent},
        )
        submitted = self._submit(order, timestamp)
        self._child_orders.append(submitted)
        self._slices_sent += 1
        return submitted

    def on_fill(self, quantity: float) -> None:
        self._filled_qty += quantity
        if self._filled_qty >= self.config.total_quantity - 1e-9:
            self._complete = True

    @property
    def is_complete(self) -> bool:
        return self._complete

    @property
    def fill_pct(self) -> float:
        return self._filled_qty / self.config.total_quantity * 100 if self.config.total_quantity > 0 else 0


class VWAPExecutor:
    """VWAP executor : distributes order according to volume profile."""

    def __init__(self, config: VWAPConfig, submit_fn: Callable[[Order, datetime], Order]):
        self.config = config
        self._submit = submit_fn
        self._filled_qty = 0.0
        self._slices_sent = 0
        self._child_orders: list[Order] = []
        self._complete = False

        # Compute weights
        if config.volume_profile and len(config.volume_profile) == config.num_slices:
            total = sum(config.volume_profile)
            self._weights = [v / total for v in config.volume_profile] if total > 0 else [1.0 / config.num_slices] * config.num_slices
        else:
            self._weights = [1.0 / config.num_slices] * config.num_slices

    def on_bar(self, bar: BarData, timestamp: datetime) -> Order | None:
        if self._complete or bar.symbol != self.config.symbol:
            return None
        if self._slices_sent >= self.config.num_slices:
            self._complete = True
            return None

        remaining = self.config.total_quantity - self._filled_qty
        qty = min(self.config.total_quantity * self._weights[self._slices_sent], remaining)
        if qty <= 0:
            self._slices_sent += 1
            return None

        order = Order(
            symbol=self.config.symbol,
            side=self.config.side,
            order_type=OrderType.MARKET,
            quantity=qty,
            metadata={"algo": "vwap", "slice": self._slices_sent, "weight": self._weights[self._slices_sent]},
        )
        submitted = self._submit(order, timestamp)
        self._child_orders.append(submitted)
        self._slices_sent += 1
        return submitted

    def on_fill(self, quantity: float) -> None:
        self._filled_qty += quantity
        if self._filled_qty >= self.config.total_quantity - 1e-9:
            self._complete = True

    @property
    def is_complete(self) -> bool:
        return self._complete


class IcebergExecutor:
    """Iceberg order : shows only visible_quantity at a time.

    When a visible slice fills, the next slice is submitted automatically.
    """

    def __init__(self, config: IcebergConfig, submit_fn: Callable[[Order, datetime], Order]):
        self.config = config
        self._submit = submit_fn
        self._filled_qty = 0.0
        self._current_order: Order | None = None
        self._child_orders: list[Order] = []
        self._complete = False

    def start(self, timestamp: datetime) -> Order:
        """Submit the first visible slice."""
        return self._submit_slice(timestamp)

    def on_fill(self, quantity: float, timestamp: datetime) -> Order | None:
        """Called when a child order fills. Submits next slice if needed."""
        self._filled_qty += quantity
        remaining = self.config.total_quantity - self._filled_qty
        if remaining <= 1e-9:
            self._complete = True
            return None
        return self._submit_slice(timestamp)

    def _submit_slice(self, timestamp: datetime) -> Order:
        remaining = self.config.total_quantity - self._filled_qty
        qty = min(self.config.visible_quantity, remaining)
        order_type = OrderType.LIMIT if self.config.limit_price else OrderType.MARKET
        order = Order(
            symbol=self.config.symbol,
            side=self.config.side,
            order_type=order_type,
            quantity=qty,
            limit_price=self.config.limit_price,
            metadata={"algo": "iceberg", "slice": len(self._child_orders)},
        )
        submitted = self._submit(order, timestamp)
        self._child_orders.append(submitted)
        self._current_order = submitted
        return submitted

    @property
    def is_complete(self) -> bool:
        return self._complete


class POVExecutor:
    """Percent of Volume executor.

    Limits each bar's execution to a fraction of the bar's volume.
    """

    def __init__(self, config: POVConfig, submit_fn: Callable[[Order, datetime], Order]):
        self.config = config
        self._submit = submit_fn
        self._filled_qty = 0.0
        self._child_orders: list[Order] = []
        self._complete = False

    def on_bar(self, bar: BarData, timestamp: datetime) -> Order | None:
        if self._complete or bar.symbol != self.config.symbol:
            return None

        remaining = self.config.total_quantity - self._filled_qty
        if remaining <= 1e-9:
            self._complete = True
            return None

        max_qty = bar.volume * self.config.max_pct_of_volume
        qty = min(max_qty, remaining)
        if qty <= 0:
            return None

        order = Order(
            symbol=self.config.symbol,
            side=self.config.side,
            order_type=OrderType.MARKET,
            quantity=qty,
            metadata={"algo": "pov", "bar_volume": bar.volume},
        )
        submitted = self._submit(order, timestamp)
        self._child_orders.append(submitted)
        return submitted

    def on_fill(self, quantity: float) -> None:
        self._filled_qty += quantity
        if self._filled_qty >= self.config.total_quantity - 1e-9:
            self._complete = True

    @property
    def is_complete(self) -> bool:
        return self._complete
