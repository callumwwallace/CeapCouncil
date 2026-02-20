"""Tests for the broker simulator and fill models."""

import pytest
from datetime import datetime

from app.engine.broker.broker import BrokerSimulator, CommissionModel
from app.engine.broker.fill_models import FillModel, FillResult
from app.engine.broker.order import Order, OrderSide, OrderType, OrderStatus, TimeInForce
from app.engine.broker.slippage import (
    NoSlippage, PercentageSlippage, VolumeAwareSlippage, LinearSlippage, auto_detect_tier, LiquidityTier,
)
from app.engine.broker.spread import NoSpread, FixedSpread, FixedBpsSpread, VolatilitySpread
from app.engine.data.feed import BarData


def _bar(symbol="AAPL", o=150, h=155, l=148, c=152, v=1_000_000, ts=None):
    return BarData(
        symbol=symbol,
        timestamp=ts or datetime(2025, 1, 1, 10, 0),
        open=o, high=h, low=l, close=c, volume=v,
    )


class TestFillModelMarketOrders:
    def test_market_order_fills_at_open(self):
        fm = FillModel(fill_at_open=True)
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        result = fm.try_fill(order, _bar())
        assert result.filled
        assert result.fill_price == pytest.approx(150.0, abs=1.0)
        assert result.fill_quantity == 100

    def test_market_sell_fills(self):
        fm = FillModel(fill_at_open=True)
        order = Order(symbol="AAPL", side=OrderSide.SELL, order_type=OrderType.MARKET, quantity=50)
        result = fm.try_fill(order, _bar())
        assert result.filled
        assert result.fill_quantity == 50


class TestFillModelLimitOrders:
    def test_buy_limit_fills_when_price_drops(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT,
                      quantity=100, limit_price=149.0)
        bar = _bar(l=148.0)  # Low touches below limit
        result = fm.try_fill(order, bar)
        assert result.filled
        assert result.fill_price <= 149.0 + 1.0  # Limit + possible slippage

    def test_buy_limit_does_not_fill_above(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT,
                      quantity=100, limit_price=140.0)
        bar = _bar(l=148.0)  # Low never reaches limit
        result = fm.try_fill(order, bar)
        assert not result.filled

    def test_sell_limit_fills_when_price_rises(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.SELL, order_type=OrderType.LIMIT,
                      quantity=100, limit_price=154.0)
        bar = _bar(h=155.0)
        result = fm.try_fill(order, bar)
        assert result.filled
        assert result.fill_price >= 154.0 - 1.0

    def test_sell_limit_does_not_fill_below(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.SELL, order_type=OrderType.LIMIT,
                      quantity=100, limit_price=160.0)
        bar = _bar(h=155.0)
        result = fm.try_fill(order, bar)
        assert not result.filled


class TestFillModelStopOrders:
    def test_buy_stop_triggers_when_high_exceeds(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.STOP_MARKET,
                      quantity=100, stop_price=154.0)
        bar = _bar(h=155.0)
        result = fm.try_fill(order, bar)
        assert result.filled

    def test_buy_stop_does_not_trigger(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.STOP_MARKET,
                      quantity=100, stop_price=160.0)
        bar = _bar(h=155.0)
        result = fm.try_fill(order, bar)
        assert not result.filled

    def test_sell_stop_triggers_when_low_falls(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.SELL, order_type=OrderType.STOP_MARKET,
                      quantity=100, stop_price=149.0)
        bar = _bar(l=148.0)
        result = fm.try_fill(order, bar)
        assert result.filled


class TestFillModelMOOMOC:
    def test_moo_fills_at_open(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET_ON_OPEN, quantity=100)
        bar = _bar(o=150.0)
        result = fm.try_fill(order, bar)
        assert result.filled
        assert result.fill_price == pytest.approx(150.0, abs=1.0)

    def test_moc_fills_at_close(self):
        fm = FillModel()
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET_ON_CLOSE, quantity=100)
        bar = _bar(c=152.0)
        result = fm.try_fill(order, bar)
        assert result.filled
        assert result.fill_price == pytest.approx(152.0, abs=1.0)


class TestBrokerSimulator:
    def test_submit_and_fill(self):
        broker = BrokerSimulator()
        ts = datetime(2025, 1, 1, 10, 0)
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        broker.submit_order(order, ts)

        assert len(broker.pending_orders) == 1
        fills = broker.process_bar(_bar(ts=ts), ts)
        assert len(fills) == 1
        assert fills[0].quantity == 100
        assert len(broker.pending_orders) == 0

    def test_cancel_order(self):
        broker = BrokerSimulator()
        ts = datetime(2025, 1, 1)
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT,
                      quantity=100, limit_price=100.0)
        broker.submit_order(order, ts)
        assert broker.cancel_order(order.order_id, ts)
        assert len(broker.pending_orders) == 0

    def test_cancel_day_orders(self):
        broker = BrokerSimulator()
        ts = datetime(2025, 1, 1)
        o1 = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT,
                    quantity=100, limit_price=100.0, time_in_force=TimeInForce.DAY)
        o2 = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.LIMIT,
                    quantity=100, limit_price=100.0, time_in_force=TimeInForce.GTC)
        broker.submit_order(o1, ts)
        broker.submit_order(o2, ts)

        cancelled = broker.cancel_day_orders(ts)
        assert cancelled == 1
        assert len(broker.pending_orders) == 1


class TestSpreadModels:
    def test_no_spread(self):
        m = NoSpread()
        assert m.get_spread(_bar()) == 0.0

    def test_fixed_spread(self):
        m = FixedSpread(spread=0.05)
        assert m.get_spread(_bar()) == 0.05
        assert m.get_ask(100.0, _bar()) == 100.025
        assert m.get_bid(100.0, _bar()) == 99.975

    def test_fixed_bps_spread(self):
        m = FixedBpsSpread(bps=10.0)
        bar = _bar(c=100.0)
        assert m.get_spread(bar) == pytest.approx(0.1)  # 10 bps of 100

    def test_volatility_spread_crypto_wider(self):
        bar = _bar(c=100.0, h=100.5, l=99.5, v=1_000_000)
        stock = VolatilitySpread(is_crypto=False, max_spread_bps=10000.0)
        crypto = VolatilitySpread(is_crypto=True, max_spread_bps=10000.0)
        assert crypto.get_spread(bar) > stock.get_spread(bar)


class TestSlippageModels:
    def test_no_slippage(self):
        m = NoSlippage()
        assert m.compute_slippage(100.0, 50, _bar(), True) == 0.0

    def test_percentage_slippage(self):
        m = PercentageSlippage(pct=0.1)
        slip = m.compute_slippage(100.0, 50, _bar(), True)
        assert slip == pytest.approx(0.1)  # 0.1% of 100

    def test_volume_aware_large_orders_more_slippage(self):
        m = VolumeAwareSlippage()
        bar = _bar(v=10000)
        slip_small = m.compute_slippage(100.0, 10, bar, True)
        slip_large = m.compute_slippage(100.0, 5000, bar, True)
        assert slip_large > slip_small

    def test_auto_detect_tier(self):
        assert auto_detect_tier(500_000_000) == LiquidityTier.HIGH
        assert auto_detect_tier(50_000_000) == LiquidityTier.MID
        assert auto_detect_tier(1_000_000) == LiquidityTier.LOW
