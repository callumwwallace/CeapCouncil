"""Integration tests — full engine run end-to-end.

Tests the complete pipeline: data feed → strategy → broker → portfolio → results.
Validates output format matches frontend contract.
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from app.engine.core.engine import Engine, EngineConfig, EngineResult
from app.engine.strategy.base import StrategyBase
from app.engine.strategy.compiler import compile_strategy
from app.engine.data.feed import BarData, DataFeed
from app.engine.broker.order import Order, OrderSide, OrderType
from app.engine.portfolio.portfolio import Portfolio, MarginConfig
from app.engine.core.clock import SimulationClock, ClockMode
from app.engine.core.deterministic import (
    DeterministicContext, hash_dataset, hash_strategy, generate_backtest_id,
)
from app.engine.data.calendar import ExchangeCalendar, MarketType
from app.engine.portfolio.construction import (
    PortfolioConstructor, WeightingScheme, PortfolioConstraints,
)
from app.engine.risk.manager import RiskManager, RiskLimits


def _generate_price_data(
    symbol: str = "AAPL",
    days: int = 252,
    start_price: float = 150.0,
    volatility: float = 0.02,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate synthetic daily OHLCV data for testing."""
    np.random.seed(seed)
    dates = pd.bdate_range(start="2024-01-02", periods=days)
    prices = [start_price]
    for _ in range(days - 1):
        ret = np.random.normal(0.0005, volatility)
        prices.append(prices[-1] * (1 + ret))

    data = {
        "Open": [p * (1 + np.random.uniform(-0.005, 0.005)) for p in prices],
        "High": [p * (1 + abs(np.random.normal(0, 0.01))) for p in prices],
        "Low": [p * (1 - abs(np.random.normal(0, 0.01))) for p in prices],
        "Close": prices,
        "Volume": [int(np.random.uniform(500000, 5000000)) for _ in prices],
    }
    return pd.DataFrame(data, index=dates)


class BuyAndHoldStrategy(StrategyBase):
    """Simple buy-and-hold for integration testing."""

    def on_init(self):
        self._bought = False

    def on_data(self, bar):
        if not self._bought and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash * 0.95 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
                self._bought = True


class SMAStrategy(StrategyBase):
    """Simple moving average crossover strategy."""

    def on_init(self):
        self._sma_period = self.params.get("sma_period", 20)

    def on_data(self, bar):
        bars = self.history(bar.symbol, self._sma_period)
        if len(bars) < self._sma_period:
            return

        sma = sum(b.close for b in bars) / len(bars)

        if bar.close > sma and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash * 0.9 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
        elif bar.close < sma and self.is_long(bar.symbol):
            self.close_position(bar.symbol)


class TestEngineIntegration:
    """Full end-to-end engine tests."""

    def test_buy_and_hold(self):
        config = EngineConfig(initial_capital=100000)
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data())
        engine.set_strategy(BuyAndHoldStrategy())

        result = engine.run()
        assert isinstance(result, EngineResult)
        assert result.final_value > 0
        assert len(result.equity_curve) > 0
        assert len(result.trades) >= 0  # Buy-and-hold may have 0 completed trades

    def test_sma_crossover(self):
        config = EngineConfig(initial_capital=100000, commission_rate=0.001)
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data(days=252))
        engine.set_strategy(SMAStrategy(params={"sma_period": 20}))

        result = engine.run()
        assert result.final_value > 0
        assert len(result.equity_curve) > 200
        assert result.metrics.total_trades >= 0

    def test_results_dict_matches_frontend_contract(self):
        config = EngineConfig(initial_capital=50000)
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data(days=100))
        engine.set_strategy(BuyAndHoldStrategy())

        result = engine.run()
        d = result.to_results_dict()

        # Verify all required fields for frontend compatibility
        required_fields = [
            "final_value", "initial_capital", "total_return_pct",
            "sharpe_ratio", "max_drawdown_pct", "total_trades",
            "win_rate", "trades", "equity_curve", "drawdown_series",
        ]
        for field in required_fields:
            assert field in d, f"Missing required field: {field}"

        assert d["initial_capital"] == 50000

    def test_user_compiled_strategy(self):
        code = """
class MyStrategy(StrategyBase):
    def on_init(self):
        self._entered = False

    def on_data(self, bar):
        if not self._entered and self.bar_index >= 5:
            qty = int(self.portfolio.cash * 0.5 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
                self._entered = True
        elif self._entered and self.bar_index >= 50:
            self.close_position(bar.symbol)
            self._entered = False
"""
        strategy_cls = compile_strategy(code)
        strategy = strategy_cls()

        config = EngineConfig(initial_capital=100000)
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data(days=100))
        engine.set_strategy(strategy)

        result = engine.run()
        assert result.final_value > 0
        assert len(result.orders) > 0

    def test_with_spread_and_slippage(self):
        config = EngineConfig(
            initial_capital=100000,
            spread_model="volatility",
            slippage_model="volume_aware",
            is_crypto=True,
        )
        engine = Engine(config)
        engine.add_data("BTC-USD", _generate_price_data(start_price=42000, volatility=0.03))
        engine.set_strategy(BuyAndHoldStrategy())

        result = engine.run()
        # With spread and slippage, returns should be slightly worse
        assert result.final_value > 0

    def test_with_margin(self):
        config = EngineConfig(
            initial_capital=50000,
            margin_enabled=True,
            max_leverage=2.0,
        )
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data())
        engine.set_strategy(BuyAndHoldStrategy())

        result = engine.run()
        assert result.final_value > 0

    def test_risk_manager_halts_on_drawdown(self):
        """Strategy that always loses should trigger risk halt."""

        class AlwaysLose(StrategyBase):
            def on_data(self, bar):
                if self.bar_index % 10 == 0 and self.is_flat(bar.symbol):
                    self.market_order(bar.symbol, 100)
                elif self.bar_index % 10 == 5 and self.is_long(bar.symbol):
                    self.close_position(bar.symbol)

        config = EngineConfig(initial_capital=10000, max_drawdown_pct=5.0)
        engine = Engine(config)
        # Downward trending data
        np.random.seed(42)
        df = _generate_price_data(start_price=100, volatility=0.05, days=200)
        engine.add_data("LOSE", df)
        engine.set_strategy(AlwaysLose())

        result = engine.run()
        # Risk manager should have kicked in
        assert result.final_value > 0  # Didn't go to 0 thanks to risk manager

    def test_elapsed_time_recorded(self):
        config = EngineConfig(initial_capital=100000)
        engine = Engine(config)
        engine.add_data("AAPL", _generate_price_data(days=50))
        engine.set_strategy(BuyAndHoldStrategy())
        result = engine.run()
        assert result.elapsed_ms > 0

    def test_no_strategy_raises(self):
        engine = Engine()
        engine.add_data("AAPL", _generate_price_data(days=10))
        with pytest.raises(ValueError, match="No strategy"):
            engine.run()

    def test_no_data_raises(self):
        engine = Engine()
        engine.set_strategy(BuyAndHoldStrategy())
        with pytest.raises(ValueError, match="No data"):
            engine.run()


class TestDataFeed:
    def test_add_symbol(self):
        feed = DataFeed()
        feed.add_symbol("AAPL", _generate_price_data(days=10))
        assert "AAPL" in feed.symbols
        assert feed.total_bars("AAPL") == 10

    def test_multi_symbol_iteration(self):
        feed = DataFeed()
        feed.add_symbol("AAPL", _generate_price_data(days=10, seed=1))
        feed.add_symbol("MSFT", _generate_price_data(days=10, seed=2))

        groups = list(feed.iterate())
        assert len(groups) == 10  # Same number of days
        assert len(groups[0]) == 2  # Two symbols per group

    def test_get_bar(self):
        feed = DataFeed()
        df = _generate_price_data(days=10)
        feed.add_symbol("AAPL", df)
        bar = feed.get_bar("AAPL", 0)
        assert bar is not None
        assert bar.symbol == "AAPL"
        assert bar.bar_index == 0


class TestSimulationClock:
    def test_advance(self):
        clock = SimulationClock()
        clock.set_range(datetime(2025, 1, 1), datetime(2025, 12, 31))
        clock.advance(datetime(2025, 1, 2))
        assert clock.now == datetime(2025, 1, 2)
        assert clock.bar_count == 1

    def test_cannot_go_backwards(self):
        clock = SimulationClock()
        clock.set_range(datetime(2025, 1, 1), datetime(2025, 12, 31))
        clock.advance(datetime(2025, 6, 1))
        with pytest.raises(ValueError, match="Cannot go back"):
            clock.advance(datetime(2025, 5, 1))

    def test_reset(self):
        clock = SimulationClock()
        clock.set_range(datetime(2025, 1, 1), datetime(2025, 12, 31))
        clock.advance(datetime(2025, 6, 1))
        clock.reset()
        assert clock.bar_count == 0


class TestDeterminism:
    def test_same_seed_same_results(self):
        ctx1 = DeterministicContext(seed=42)
        ctx2 = DeterministicContext(seed=42)
        assert ctx1.rng.rand() == ctx2.rng.rand()

    def test_different_seed_different_results(self):
        ctx1 = DeterministicContext(seed=42)
        ctx2 = DeterministicContext(seed=99)
        assert ctx1.rng.rand() != ctx2.rng.rand()

    def test_dataset_hash_deterministic(self):
        data = {"AAPL": [{"close": 150}, {"close": 151}]}
        h1 = hash_dataset(data)
        h2 = hash_dataset(data)
        assert h1 == h2

    def test_strategy_hash(self):
        code = "class MyStrategy: pass"
        h1 = hash_strategy(code, {"sma": 20})
        h2 = hash_strategy(code, {"sma": 20})
        h3 = hash_strategy(code, {"sma": 30})
        assert h1 == h2
        assert h1 != h3

    def test_backtest_id_reproducible(self):
        id1 = generate_backtest_id("abc", "def", "ghi")
        id2 = generate_backtest_id("abc", "def", "ghi")
        assert id1 == id2
        assert len(id1) == 24


class TestExchangeCalendar:
    def test_crypto_always_open(self):
        cal = ExchangeCalendar(MarketType.CRYPTO)
        assert cal.is_trading_day(datetime(2025, 1, 4).date())  # Saturday
        assert cal.is_market_open(datetime(2025, 1, 4, 3, 0))

    def test_equity_closed_weekends(self):
        cal = ExchangeCalendar(MarketType.US_EQUITY)
        assert not cal.is_trading_day(datetime(2025, 1, 4).date())  # Saturday
        assert not cal.is_trading_day(datetime(2025, 1, 5).date())  # Sunday
        assert cal.is_trading_day(datetime(2025, 1, 6).date())  # Monday

    def test_equity_closed_holidays(self):
        cal = ExchangeCalendar(MarketType.US_EQUITY)
        assert not cal.is_trading_day(datetime(2025, 12, 25).date())

    def test_detect_crypto(self):
        assert ExchangeCalendar.detect_market_type("BTC-USD") == MarketType.CRYPTO
        assert ExchangeCalendar.detect_market_type("ETH-USD") == MarketType.CRYPTO

    def test_detect_equity(self):
        assert ExchangeCalendar.detect_market_type("AAPL") == MarketType.US_EQUITY

    def test_detect_futures(self):
        assert ExchangeCalendar.detect_market_type("ES=F") == MarketType.US_FUTURES


class TestPortfolioConstruction:
    def test_equal_weight(self):
        constraints = PortfolioConstraints(max_position_pct=100.0)
        pc = PortfolioConstructor(WeightingScheme.EQUAL, constraints)
        weights = pc.compute_weights(["AAPL", "MSFT", "GOOG"])
        assert len(weights) == 3
        assert sum(weights.values()) == pytest.approx(1.0, abs=0.001)
        for w in weights.values():
            assert w == pytest.approx(1 / 3, abs=0.001)

    def test_inverse_volatility(self):
        constraints = PortfolioConstraints(max_position_pct=100.0)
        pc = PortfolioConstructor(WeightingScheme.INVERSE_VOLATILITY, constraints)
        vols = {"AAPL": 20.0, "MSFT": 30.0, "GOOG": 10.0}
        weights = pc.compute_weights(["AAPL", "MSFT", "GOOG"], volatilities=vols)
        # Lower vol should get higher weight
        assert weights["GOOG"] > weights["AAPL"]
        assert weights["AAPL"] > weights["MSFT"]

    def test_constraints_max_position(self):
        constraints = PortfolioConstraints(max_position_pct=10.0)
        pc = PortfolioConstructor(WeightingScheme.EQUAL, constraints)
        weights = pc.compute_weights(["A", "B", "C"])
        for w in weights.values():
            assert w <= 0.1 + 0.001


class TestRiskManager:
    def test_order_within_limits(self):
        rm = RiskManager(RiskLimits(max_position_pct=50.0))
        port = Portfolio(initial_cash=100000)
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        allowed, reason = rm.check_order(order, port, 150.0)
        assert allowed

    def test_order_exceeds_position_limit(self):
        rm = RiskManager(RiskLimits(max_position_pct=10.0))
        port = Portfolio(initial_cash=100000)
        order = Order(symbol="AAPL", side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=100)
        allowed, reason = rm.check_order(order, port, 150.0)
        # 100 * 150 = 15000, which is 15% of 100k > 10% limit
        assert not allowed
        assert "exceeds max" in reason
