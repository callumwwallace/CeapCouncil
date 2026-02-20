"""Order model — full state machine for order lifecycle.

Supports: Market, Limit, Stop Market, Stop Limit, Trailing Stop, MOO, MOC.
Time-in-force: GTC (Good-Til-Cancelled), DAY.
Partial fills with remaining quantity tracking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
import uuid


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP_MARKET = "stop_market"
    STOP_LIMIT = "stop_limit"
    TRAILING_STOP = "trailing_stop"
    MARKET_ON_OPEN = "moo"
    MARKET_ON_CLOSE = "moc"


class OrderStatus(Enum):
    CREATED = "created"
    SUBMITTED = "submitted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class TimeInForce(Enum):
    GTC = "gtc"       # Good til cancelled
    DAY = "day"       # Cancel at session close


# Valid state transitions
_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.CREATED: {OrderStatus.SUBMITTED, OrderStatus.REJECTED},
    OrderStatus.SUBMITTED: {
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
    },
    OrderStatus.PARTIALLY_FILLED: {
        OrderStatus.FILLED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.FILLED: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.REJECTED: set(),
}


@dataclass
class Order:
    """Represents a single order through its full lifecycle."""
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    limit_price: float | None = None
    stop_price: float | None = None
    trail_amount: float | None = None      # Absolute trail
    trail_percent: float | None = None     # Percentage trail
    time_in_force: TimeInForce = TimeInForce.GTC

    # State
    order_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: OrderStatus = OrderStatus.CREATED
    filled_quantity: float = 0.0
    avg_fill_price: float = 0.0
    commission: float = 0.0
    slippage_cost: float = 0.0

    # Timestamps
    created_at: datetime | None = None
    submitted_at: datetime | None = None
    filled_at: datetime | None = None
    cancelled_at: datetime | None = None

    # Trailing stop tracking
    _trail_peak: float | None = field(default=None, repr=False)

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def remaining_quantity(self) -> float:
        return self.quantity - self.filled_quantity

    @property
    def is_active(self) -> bool:
        return self.status in (OrderStatus.SUBMITTED, OrderStatus.PARTIALLY_FILLED)

    @property
    def is_terminal(self) -> bool:
        return self.status in (OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED)

    @property
    def is_buy(self) -> bool:
        return self.side == OrderSide.BUY

    def transition(self, new_status: OrderStatus) -> None:
        """Move to a new status. Raises ValueError on invalid transitions."""
        valid = _TRANSITIONS.get(self.status, set())
        if new_status not in valid:
            raise ValueError(
                f"Invalid order transition: {self.status.value} -> {new_status.value}. "
                f"Valid transitions: {[s.value for s in valid]}"
            )
        self.status = new_status

    def submit(self, timestamp: datetime) -> None:
        self.transition(OrderStatus.SUBMITTED)
        self.submitted_at = timestamp

    def fill(self, quantity: float, price: float, commission: float,
             slippage: float, timestamp: datetime) -> None:
        """Record a (partial) fill."""
        if quantity <= 0:
            raise ValueError(f"Fill quantity must be positive, got {quantity}")
        if quantity > self.remaining_quantity + 1e-9:
            raise ValueError(
                f"Fill quantity {quantity} exceeds remaining {self.remaining_quantity}"
            )

        # Update weighted average fill price
        total_filled = self.filled_quantity + quantity
        self.avg_fill_price = (
            (self.avg_fill_price * self.filled_quantity + price * quantity) / total_filled
        )
        self.filled_quantity = total_filled
        self.commission += commission
        self.slippage_cost += slippage

        if abs(self.remaining_quantity) < 1e-9:
            self.transition(OrderStatus.FILLED)
            self.filled_at = timestamp
        else:
            if self.status == OrderStatus.SUBMITTED:
                self.transition(OrderStatus.PARTIALLY_FILLED)

    def cancel(self, timestamp: datetime) -> None:
        self.transition(OrderStatus.CANCELLED)
        self.cancelled_at = timestamp

    def reject(self, reason: str = "") -> None:
        self.transition(OrderStatus.REJECTED)
        self.metadata["reject_reason"] = reason

    def update_trail(self, current_price: float) -> float | None:
        """Update trailing stop peak and return the current stop price, or None."""
        if self.order_type != OrderType.TRAILING_STOP:
            return None

        if self._trail_peak is None:
            self._trail_peak = current_price

        if self.side == OrderSide.SELL:
            # Trailing stop for long position — sell when price drops from peak
            self._trail_peak = max(self._trail_peak, current_price)
            if self.trail_percent:
                return self._trail_peak * (1 - self.trail_percent / 100)
            elif self.trail_amount:
                return self._trail_peak - self.trail_amount
        else:
            # Trailing stop for short position — buy when price rises from trough
            self._trail_peak = min(self._trail_peak, current_price)
            if self.trail_percent:
                return self._trail_peak * (1 + self.trail_percent / 100)
            elif self.trail_amount:
                return self._trail_peak + self.trail_amount
        return None

    def to_dict(self) -> dict:
        return {
            "order_id": self.order_id,
            "symbol": self.symbol,
            "side": self.side.value,
            "order_type": self.order_type.value,
            "quantity": self.quantity,
            "filled_quantity": self.filled_quantity,
            "remaining_quantity": self.remaining_quantity,
            "limit_price": self.limit_price,
            "stop_price": self.stop_price,
            "avg_fill_price": round(self.avg_fill_price, 4),
            "commission": round(self.commission, 4),
            "status": self.status.value,
            "time_in_force": self.time_in_force.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "filled_at": self.filled_at.isoformat() if self.filled_at else None,
        }
