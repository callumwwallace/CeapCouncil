"""Event system — the backbone of the event-driven engine.

All engine communication flows through typed events placed on a priority queue.
Events are processed in timestamp order; within the same timestamp, priority
determines processing order (lower number = higher priority).
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum
from typing import Any


class EventPriority(IntEnum):
    """Processing order within the same timestamp."""
    MARKET_DATA = 0
    FILL = 1
    ORDER = 2
    SIGNAL = 3
    TIMER = 4


@dataclass(order=False)
class Event:
    """Base event with timestamp and priority for deterministic ordering."""
    timestamp: datetime
    priority: EventPriority = field(default=EventPriority.TIMER)
    sequence: int = field(default=0, compare=False)

    def __lt__(self, other: Event) -> bool:
        if self.timestamp != other.timestamp:
            return self.timestamp < other.timestamp
        if self.priority != other.priority:
            return self.priority < other.priority
        return self.sequence < other.sequence


@dataclass(order=False)
class MarketDataEvent(Event):
    """New bar/tick data available for a symbol."""
    symbol: str = ""
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: float = 0.0
    bar_index: int = 0

    def __post_init__(self):
        self.priority = EventPriority.MARKET_DATA


@dataclass(order=False)
class OrderEvent(Event):
    """Order submission, cancellation, or modification."""
    order_id: str = ""
    action: str = "submit"  # submit, cancel, replace

    def __post_init__(self):
        self.priority = EventPriority.ORDER


@dataclass(order=False)
class FillEvent(Event):
    """Order fill notification."""
    order_id: str = ""
    symbol: str = ""
    side: str = "buy"
    quantity: float = 0.0
    fill_price: float = 0.0
    commission: float = 0.0
    slippage: float = 0.0

    def __post_init__(self):
        self.priority = EventPriority.FILL


@dataclass(order=False)
class TimerEvent(Event):
    """Scheduled timer callback (rebalance, EOD, etc.)."""
    name: str = ""
    data: dict = field(default_factory=dict)

    def __post_init__(self):
        self.priority = EventPriority.TIMER


@dataclass(order=False)
class SignalEvent(Event):
    """Strategy-generated signal (buy/sell intent before order creation)."""
    symbol: str = ""
    signal_type: str = ""
    strength: float = 0.0
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        self.priority = EventPriority.SIGNAL


class EventQueue:
    """Thread-safe priority queue for deterministic event processing."""

    def __init__(self):
        self._heap: list[Event] = []
        self._counter: int = 0

    def push(self, event: Event) -> None:
        event.sequence = self._counter
        self._counter += 1
        heapq.heappush(self._heap, event)

    def pop(self) -> Event:
        if not self._heap:
            raise IndexError("Event queue is empty")
        return heapq.heappop(self._heap)

    def peek(self) -> Event | None:
        return self._heap[0] if self._heap else None

    def is_empty(self) -> bool:
        return len(self._heap) == 0

    def __len__(self) -> int:
        return len(self._heap)

    def clear(self) -> None:
        self._heap.clear()
        self._counter = 0
