"""Tests for paper trading engine."""

import pytest
from datetime import datetime, timedelta

from app.engine.adapters.paper_trading import (
    PaperTradingEngine, PaperTradingConfig, BacktestVsLiveComparator,
)
from app.engine.strategy.base import StrategyBase
from app.engine.data.feed import BarData


class SimplePaperStrategy(StrategyBase):
    """Buy at first bar, sell at 5th."""

    def on_data(self, bar):
        if self.bar_index == 0 and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash * 0.5 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
        elif self.bar_index == 4 and self.is_long(bar.symbol):
            self.close_position(bar.symbol)


class TestPaperTrading:
    def test_start_stop(self):
        engine = PaperTradingEngine(PaperTradingConfig(initial_capital=50000))
        engine.set_strategy(SimplePaperStrategy())
        engine.add_symbol("AAPL")
        engine.start()

        state = engine.get_state()
        assert state.status == "running"

        results = engine.stop()
        assert results["status"] == "stopped"
        assert results["final_equity"] > 0

    def test_process_bars(self):
        engine = PaperTradingEngine(PaperTradingConfig(initial_capital=100000))
        engine.set_strategy(SimplePaperStrategy())
        engine.add_symbol("AAPL")
        engine.start()

        for i in range(10):
            bar = BarData(
                symbol="AAPL",
                timestamp=datetime(2025, 1, 1 + i, 10, 0),
                open=150 + i, high=152 + i, low=148 + i, close=151 + i,
                volume=1_000_000,
            )
            engine.process_bar(bar)

        state = engine.get_state()
        assert state.bars_processed == 10

        results = engine.stop()
        assert results["bars_processed"] == 10

    def test_pause_resume(self):
        engine = PaperTradingEngine()
        engine.set_strategy(SimplePaperStrategy())
        engine.start()

        engine.pause()
        assert engine.get_state().status == "paused"

        engine.resume()
        assert engine.get_state().status == "running"

    def test_no_strategy_raises(self):
        engine = PaperTradingEngine()
        with pytest.raises(ValueError, match="No strategy"):
            engine.start()


class TestBacktestVsLiveComparator:
    def test_comparison(self):
        comp = BacktestVsLiveComparator()
        comp.set_backtest_curve([
            {"date": "2025-01-01", "equity": 100000},
            {"date": "2025-01-02", "equity": 101000},
            {"date": "2025-01-03", "equity": 102000},
        ])
        comp.add_live_point("2025-01-01", 100000)
        comp.add_live_point("2025-01-02", 100800)
        comp.add_live_point("2025-01-03", 101500)

        result = comp.get_comparison()
        assert result["backtest_final"] == 102000
        assert result["live_final"] == 101500

    def test_tracking_error(self):
        comp = BacktestVsLiveComparator()
        comp.set_backtest_curve([
            {"date": f"2025-01-{i:02d}", "equity": 100000 + i * 100}
            for i in range(1, 21)
        ])
        for i in range(1, 21):
            comp.add_live_point(f"2025-01-{i:02d}", 100000 + i * 95)

        te = comp.compute_tracking_error()
        assert te is not None
        assert te >= 0

    def test_empty_comparison(self):
        comp = BacktestVsLiveComparator()
        assert comp.compute_tracking_error() is None
