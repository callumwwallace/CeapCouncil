"""Tests for the event system."""

import pytest
from datetime import datetime

from app.engine.core.events import (
    Event, EventQueue, EventPriority,
    MarketDataEvent, OrderEvent, FillEvent, TimerEvent, SignalEvent,
)


class TestEventOrdering:
    """Events must be processed in timestamp order, then by priority."""

    def test_events_ordered_by_timestamp(self):
        q = EventQueue()
        e1 = Event(timestamp=datetime(2025, 1, 2))
        e2 = Event(timestamp=datetime(2025, 1, 1))
        e3 = Event(timestamp=datetime(2025, 1, 3))
        q.push(e1)
        q.push(e2)
        q.push(e3)

        assert q.pop().timestamp == datetime(2025, 1, 1)
        assert q.pop().timestamp == datetime(2025, 1, 2)
        assert q.pop().timestamp == datetime(2025, 1, 3)

    def test_same_timestamp_ordered_by_priority(self):
        ts = datetime(2025, 1, 1)
        q = EventQueue()
        q.push(TimerEvent(timestamp=ts))
        q.push(MarketDataEvent(timestamp=ts, symbol="X"))
        q.push(OrderEvent(timestamp=ts))

        first = q.pop()
        assert isinstance(first, MarketDataEvent)
        second = q.pop()
        assert isinstance(second, OrderEvent)
        third = q.pop()
        assert isinstance(third, TimerEvent)

    def test_same_priority_ordered_by_sequence(self):
        ts = datetime(2025, 1, 1)
        q = EventQueue()
        e1 = MarketDataEvent(timestamp=ts, symbol="A")
        e2 = MarketDataEvent(timestamp=ts, symbol="B")
        q.push(e1)
        q.push(e2)

        assert q.pop().symbol == "A"
        assert q.pop().symbol == "B"


class TestEventQueue:
    def test_empty_queue(self):
        q = EventQueue()
        assert q.is_empty()
        assert len(q) == 0
        assert q.peek() is None

    def test_push_pop(self):
        q = EventQueue()
        e = Event(timestamp=datetime(2025, 1, 1))
        q.push(e)
        assert not q.is_empty()
        assert len(q) == 1
        popped = q.pop()
        assert popped.timestamp == e.timestamp
        assert q.is_empty()

    def test_pop_empty_raises(self):
        q = EventQueue()
        with pytest.raises(IndexError):
            q.pop()

    def test_clear(self):
        q = EventQueue()
        q.push(Event(timestamp=datetime(2025, 1, 1)))
        q.push(Event(timestamp=datetime(2025, 1, 2)))
        q.clear()
        assert q.is_empty()


class TestMarketDataEvent:
    def test_fields(self):
        e = MarketDataEvent(
            timestamp=datetime(2025, 1, 1),
            symbol="AAPL",
            open=150.0, high=155.0, low=149.0, close=153.0, volume=1000000.0,
        )
        assert e.symbol == "AAPL"
        assert e.priority == EventPriority.MARKET_DATA
        assert e.close == 153.0


class TestFillEvent:
    def test_fields(self):
        e = FillEvent(
            timestamp=datetime(2025, 1, 1),
            order_id="abc123",
            symbol="BTC-USD",
            side="buy",
            quantity=1.5,
            fill_price=42000.0,
            commission=42.0,
        )
        assert e.priority == EventPriority.FILL
        assert e.quantity == 1.5
