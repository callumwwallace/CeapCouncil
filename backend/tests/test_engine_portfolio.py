"""Tests for portfolio manager and position tracking."""

import pytest
from datetime import datetime

from app.engine.portfolio.portfolio import Portfolio, MarginConfig
from app.engine.portfolio.position import Position, TradeRecord
from app.engine.core.events import FillEvent


class TestPosition:
    def test_new_position_is_flat(self):
        p = Position(symbol="AAPL")
        assert p.is_flat
        assert p.quantity == 0

    def test_buy_opens_long(self):
        p = Position(symbol="AAPL")
        trades = p.update(100, 150.0, 1.5, 0.0, 0.0, datetime(2025, 1, 1))
        assert p.is_long
        assert p.quantity == 100
        assert p.avg_cost == 150.0
        assert len(trades) == 0  # No completed trades yet

    def test_sell_closes_long(self):
        p = Position(symbol="AAPL")
        p.update(100, 150.0, 1.0, 0.0, 0.0, datetime(2025, 1, 1))
        trades = p.update(-100, 160.0, 1.0, 0.0, 0.0, datetime(2025, 1, 5))
        assert p.is_flat
        assert len(trades) == 1
        t = trades[0]
        assert t.entry_price == 150.0
        assert t.exit_price == 160.0
        assert t.trade_type == "LONG"
        assert t.pnl > 0  # Profit

    def test_partial_close(self):
        p = Position(symbol="AAPL")
        p.update(100, 150.0, 1.0, 0.0, 0.0, datetime(2025, 1, 1))
        trades = p.update(-50, 160.0, 0.5, 0.0, 0.0, datetime(2025, 1, 5))
        assert p.quantity == 50
        assert len(trades) == 1
        assert trades[0].size == 50

    def test_short_position(self):
        p = Position(symbol="AAPL")
        p.update(-100, 150.0, 1.0, 0.0, 0.0, datetime(2025, 1, 1))
        assert p.is_short
        trades = p.update(100, 140.0, 1.0, 0.0, 0.0, datetime(2025, 1, 5))
        assert p.is_flat
        assert len(trades) == 1
        assert trades[0].trade_type == "SHORT"
        assert trades[0].pnl > 0  # Profit on short

    def test_unrealized_pnl_long(self):
        p = Position(symbol="AAPL")
        p.update(100, 150.0, 0.0, 0.0, 0.0, datetime(2025, 1, 1))
        assert p.unrealized_pnl(160.0) == pytest.approx(1000.0)
        assert p.unrealized_pnl(140.0) == pytest.approx(-1000.0)

    def test_unrealized_pnl_short(self):
        p = Position(symbol="AAPL")
        p.update(-100, 150.0, 0.0, 0.0, 0.0, datetime(2025, 1, 1))
        assert p.unrealized_pnl(140.0) == pytest.approx(1000.0)
        assert p.unrealized_pnl(160.0) == pytest.approx(-1000.0)


class TestPortfolio:
    def test_initial_state(self):
        p = Portfolio(initial_cash=100000.0)
        assert p.cash == 100000.0
        assert p.equity == 100000.0
        assert p.total_return_pct == 0.0

    def test_buy_deducts_cash(self):
        p = Portfolio(initial_cash=100000.0)
        fill = FillEvent(
            timestamp=datetime(2025, 1, 1),
            order_id="o1", symbol="AAPL", side="buy",
            quantity=100, fill_price=150.0, commission=15.0,
        )
        p.on_fill(fill)
        assert p.cash == pytest.approx(100000 - 15000 - 15)
        assert p.has_position("AAPL")

    def test_sell_credits_cash(self):
        p = Portfolio(initial_cash=100000.0)
        # Buy
        p.on_fill(FillEvent(
            timestamp=datetime(2025, 1, 1),
            order_id="o1", symbol="AAPL", side="buy",
            quantity=100, fill_price=150.0, commission=15.0,
        ))
        # Sell at profit
        p.on_fill(FillEvent(
            timestamp=datetime(2025, 1, 5),
            order_id="o2", symbol="AAPL", side="sell",
            quantity=100, fill_price=160.0, commission=16.0,
        ))
        # Cash should be: 100000 - 15000 - 15 + 16000 - 16 = 100969
        assert p.cash == pytest.approx(100969.0)
        assert not p.has_position("AAPL")

    def test_equity_curve_recording(self):
        p = Portfolio(initial_cash=50000.0)
        p.record_equity(datetime(2025, 1, 1))
        p.record_equity(datetime(2025, 1, 2))
        assert len(p.equity_curve) == 2
        assert p.equity_curve[0].equity == 50000.0

    def test_multiple_positions(self):
        p = Portfolio(initial_cash=100000.0)
        p.on_fill(FillEvent(
            timestamp=datetime(2025, 1, 1),
            order_id="o1", symbol="AAPL", side="buy",
            quantity=50, fill_price=150.0, commission=7.5,
        ))
        p.on_fill(FillEvent(
            timestamp=datetime(2025, 1, 1),
            order_id="o2", symbol="MSFT", side="buy",
            quantity=30, fill_price=400.0, commission=12.0,
        ))
        assert p.has_position("AAPL")
        assert p.has_position("MSFT")
        assert p.get_position_quantity("AAPL") == 50
        assert p.get_position_quantity("MSFT") == 30


class TestPortfolioMargin:
    def test_buying_power_with_margin(self):
        margin = MarginConfig(enabled=True, max_leverage=2.0)
        p = Portfolio(initial_cash=100000.0, margin_config=margin)
        assert p.buying_power == 200000.0

    def test_margin_call_detection(self):
        margin = MarginConfig(
            enabled=True, initial_margin_pct=50.0,
            maintenance_margin_pct=25.0, max_leverage=2.0,
        )
        p = Portfolio(initial_cash=50000.0, margin_config=margin)

        # Simulate a large loss that triggers margin call
        p.cash = 5000.0  # Severely depleted
        p._margin_used = 100000.0
        assert p.check_margin_call(datetime(2025, 1, 1))

    def test_no_margin_call_when_healthy(self):
        margin = MarginConfig(enabled=True)
        p = Portfolio(initial_cash=100000.0, margin_config=margin)
        assert not p.check_margin_call(datetime(2025, 1, 1))


class TestTradeRecord:
    def test_to_dict(self):
        tr = TradeRecord(
            symbol="AAPL",
            entry_date="2025-01-01",
            exit_date="2025-01-10",
            entry_price=150.0,
            exit_price=160.0,
            size=100,
            pnl=998.0,
            pnl_pct=6.65,
            commission=2.0,
            trade_type="LONG",
        )
        d = tr.to_dict()
        assert d["entry_price"] == 150.0
        assert d["exit_price"] == 160.0
        assert d["type"] == "LONG"
