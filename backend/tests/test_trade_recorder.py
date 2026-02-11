"""Unit tests for the TradeRecorder analyzer.

Verifies that trade direction, entry/exit prices, and P&L are captured
correctly from Backtrader's Trade object.
"""
import pytest
import backtrader as bt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.tasks.backtest import TradeRecorder


# ---------------------------------------------------------------------------
# Helpers — generate synthetic OHLCV data for deterministic tests
# ---------------------------------------------------------------------------

def _make_ohlcv(days: int = 200, start_price: float = 100.0, seed: int = 42) -> pd.DataFrame:
    """Create a synthetic daily OHLCV DataFrame."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(start="2023-01-01", periods=days, freq="B")  # business days
    prices = [start_price]
    for _ in range(days - 1):
        change = rng.normal(0.0005, 0.015) * prices[-1]
        prices.append(max(prices[-1] + change, 1.0))

    close = np.array(prices)
    high = close * (1 + rng.uniform(0, 0.02, days))
    low = close * (1 - rng.uniform(0, 0.02, days))
    open_ = close * (1 + rng.uniform(-0.01, 0.01, days))
    volume = rng.integers(100_000, 10_000_000, days)

    return pd.DataFrame(
        {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume},
        index=dates,
    )


# ---------------------------------------------------------------------------
# SMA crossover strategy (always goes long)
# ---------------------------------------------------------------------------

class LongOnlySmaCross(bt.Strategy):
    params = (("fast", 10), ("slow", 30))

    def __init__(self):
        fast = bt.ind.SMA(period=self.p.fast)
        slow = bt.ind.SMA(period=self.p.slow)
        self.crossover = bt.ind.CrossOver(fast, slow)

    def next(self):
        if not self.position and self.crossover > 0:
            self.buy()
        elif self.position and self.crossover < 0:
            self.sell()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTradeRecorder:
    """Tests for the TradeRecorder Backtrader Analyzer."""

    def _run_backtest(self, strategy_cls=LongOnlySmaCross, cash: float = 10_000, days: int = 200):
        """Run a backtest and return (trades, equity_curve, final_value)."""
        df = _make_ohlcv(days=days)

        cerebro = bt.Cerebro()
        cerebro.broker.setcash(cash)
        cerebro.adddata(bt.feeds.PandasData(dataname=df))
        cerebro.addanalyzer(TradeRecorder, _name="recorder")
        cerebro.addstrategy(strategy_cls)

        results = cerebro.run()
        strat = results[0]
        analysis = strat.analyzers.recorder.get_analysis()

        return analysis["trades"], analysis["equity_curve"], cerebro.broker.getvalue()

    def test_trades_are_captured(self):
        """TradeRecorder should capture at least one closed trade."""
        trades, _, _ = self._run_backtest()
        assert len(trades) > 0, "Expected at least one closed trade"

    def test_trade_direction_is_long(self):
        """All trades from LongOnlySmaCross should be LONG."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            assert t["type"] == "LONG", f"Expected LONG, got {t['type']} for trade {t}"

    def test_entry_exit_prices_differ(self):
        """Entry and exit prices should not be identical."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            assert t["entry_price"] != t["exit_price"], (
                f"Entry and exit prices should differ: {t['entry_price']} == {t['exit_price']}"
            )

    def test_exit_price_consistent_with_pnl(self):
        """For a long trade: pnl ≈ (exit - entry) * size."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            expected_pnl = (t["exit_price"] - t["entry_price"]) * t["size"]
            assert abs(t["pnl"] - expected_pnl) < 0.02, (
                f"PnL mismatch: recorded={t['pnl']}, "
                f"computed=(({t['exit_price']} - {t['entry_price']}) * {t['size']})={expected_pnl}"
            )

    def test_trade_has_required_fields(self):
        """Every trade dict should contain all required keys."""
        required = {"entry_date", "exit_date", "entry_price", "exit_price",
                    "size", "pnl", "pnl_pct", "commission", "type"}
        trades, _, _ = self._run_backtest()
        for t in trades:
            missing = required - set(t.keys())
            assert not missing, f"Missing keys: {missing}"

    def test_dates_are_valid_format(self):
        """Trade dates should be YYYY-MM-DD strings."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            for key in ("entry_date", "exit_date"):
                dt = datetime.strptime(t[key], "%Y-%m-%d")
                assert dt.year >= 2023

    def test_exit_date_after_entry_date(self):
        """Exit date should be on or after entry date."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            assert t["exit_date"] >= t["entry_date"], (
                f"Exit {t['exit_date']} before entry {t['entry_date']}"
            )

    def test_equity_curve_has_entries(self):
        """Equity curve should have one entry per bar."""
        _, equity, _ = self._run_backtest()
        assert len(equity) > 100, f"Expected >100 equity points, got {len(equity)}"

    def test_equity_curve_starts_near_initial_capital(self):
        """First equity point should be close to initial capital."""
        _, equity, _ = self._run_backtest(cash=10_000)
        assert abs(equity[0]["equity"] - 10_000) < 500

    def test_size_is_positive(self):
        """Trade size should be positive (absolute value)."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            assert t["size"] > 0, f"Size should be > 0, got {t['size']}"

    def test_pnl_pct_is_reasonable(self):
        """P&L percentage should be within a reasonable range."""
        trades, _, _ = self._run_backtest()
        for t in trades:
            assert -100 < t["pnl_pct"] < 200, (
                f"P&L pct {t['pnl_pct']} seems unreasonable"
            )
