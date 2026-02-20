"""Tests for the order state machine."""

import pytest
from datetime import datetime

from app.engine.broker.order import (
    Order, OrderSide, OrderType, OrderStatus, TimeInForce,
)


class TestOrderStateTransitions:
    """State transition matrix: every valid/invalid transition is tested."""

    def _make_order(self, **kwargs) -> Order:
        defaults = dict(
            symbol="AAPL", side=OrderSide.BUY,
            order_type=OrderType.MARKET, quantity=100,
        )
        defaults.update(kwargs)
        return Order(**defaults)

    def test_created_to_submitted(self):
        o = self._make_order()
        assert o.status == OrderStatus.CREATED
        o.submit(datetime(2025, 1, 1))
        assert o.status == OrderStatus.SUBMITTED

    def test_created_to_rejected(self):
        o = self._make_order()
        o.transition(OrderStatus.REJECTED)
        assert o.status == OrderStatus.REJECTED

    def test_submitted_to_filled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.fill(100, 150.0, 1.5, 0.1, datetime(2025, 1, 1))
        assert o.status == OrderStatus.FILLED

    def test_submitted_to_partially_filled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.fill(50, 150.0, 0.75, 0.05, datetime(2025, 1, 1))
        assert o.status == OrderStatus.PARTIALLY_FILLED
        assert o.remaining_quantity == 50

    def test_partially_filled_to_filled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.fill(50, 150.0, 0.75, 0.05, datetime(2025, 1, 1))
        o.fill(50, 151.0, 0.75, 0.05, datetime(2025, 1, 1))
        assert o.status == OrderStatus.FILLED

    def test_submitted_to_cancelled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.cancel(datetime(2025, 1, 1))
        assert o.status == OrderStatus.CANCELLED

    def test_partially_filled_to_cancelled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.fill(50, 150.0, 0.75, 0.05, datetime(2025, 1, 1))
        o.cancel(datetime(2025, 1, 1))
        assert o.status == OrderStatus.CANCELLED
        assert o.filled_quantity == 50

    def test_invalid_created_to_filled(self):
        o = self._make_order()
        with pytest.raises(ValueError, match="Invalid order transition"):
            o.transition(OrderStatus.FILLED)

    def test_invalid_filled_to_cancelled(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.fill(100, 150.0, 1.5, 0.1, datetime(2025, 1, 1))
        with pytest.raises(ValueError):
            o.cancel(datetime(2025, 1, 2))

    def test_invalid_cancelled_to_submitted(self):
        o = self._make_order()
        o.submit(datetime(2025, 1, 1))
        o.cancel(datetime(2025, 1, 1))
        with pytest.raises(ValueError):
            o.submit(datetime(2025, 1, 2))


class TestOrderFills:
    def test_avg_fill_price(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        o.submit(datetime(2025, 1, 1))
        o.fill(60, 150.0, 0.9, 0.0, datetime(2025, 1, 1))
        o.fill(40, 160.0, 0.6, 0.0, datetime(2025, 1, 1))
        expected = (60 * 150 + 40 * 160) / 100
        assert abs(o.avg_fill_price - expected) < 0.001

    def test_fill_exceeding_quantity_raises(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        o.submit(datetime(2025, 1, 1))
        with pytest.raises(ValueError, match="exceeds remaining"):
            o.fill(101, 150.0, 1.5, 0.0, datetime(2025, 1, 1))

    def test_zero_fill_raises(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        o.submit(datetime(2025, 1, 1))
        with pytest.raises(ValueError, match="must be positive"):
            o.fill(0, 150.0, 0.0, 0.0, datetime(2025, 1, 1))

    def test_commission_accumulates(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        o.submit(datetime(2025, 1, 1))
        o.fill(50, 150.0, 1.0, 0.0, datetime(2025, 1, 1))
        o.fill(50, 151.0, 1.5, 0.0, datetime(2025, 1, 1))
        assert o.commission == 2.5


class TestOrderProperties:
    def test_is_active(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        assert not o.is_active  # CREATED is not active
        o.submit(datetime(2025, 1, 1))
        assert o.is_active
        o.fill(100, 150.0, 1.5, 0.0, datetime(2025, 1, 1))
        assert not o.is_active

    def test_is_terminal(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        assert not o.is_terminal
        o.submit(datetime(2025, 1, 1))
        o.cancel(datetime(2025, 1, 1))
        assert o.is_terminal

    def test_to_dict(self):
        o = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT, quantity=100, limit_price=150.0)
        d = o.to_dict()
        assert d["symbol"] == "AAPL"
        assert d["side"] == "buy"
        assert d["order_type"] == "limit"
        assert d["limit_price"] == 150.0


class TestTrailingStop:
    def test_sell_trailing_stop_tracks_peak(self):
        o = Order(
            symbol="AAPL", side=OrderSide.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=100, trail_percent=5.0,
        )
        # Price rises to 200
        stop = o.update_trail(200.0)
        assert stop == pytest.approx(190.0)  # 200 * 0.95

        # Price rises to 210
        stop = o.update_trail(210.0)
        assert stop == pytest.approx(199.5)  # 210 * 0.95

        # Price drops to 205; peak stays at 210
        stop = o.update_trail(205.0)
        assert stop == pytest.approx(199.5)

    def test_buy_trailing_stop_tracks_trough(self):
        o = Order(
            symbol="AAPL", side=OrderSide.BUY,
            order_type=OrderType.TRAILING_STOP,
            quantity=100, trail_amount=5.0,
        )
        stop = o.update_trail(100.0)
        assert stop == 105.0

        stop = o.update_trail(95.0)
        assert stop == 100.0
