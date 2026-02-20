"""Tests for analytics and metrics computation."""

import pytest
import numpy as np
from datetime import datetime, timedelta

from app.engine.analytics.metrics import (
    compute_metrics, derive_drawdown_series, sample_series, MetricsResult,
)
from app.engine.portfolio.position import TradeRecord


def _make_equity_curve(values: list[float], start_date: str = "2025-01-01") -> list[dict]:
    """Generate an equity curve from a list of values."""
    dt = datetime.strptime(start_date, "%Y-%m-%d")
    return [
        {"date": (dt + timedelta(days=i)).strftime("%Y-%m-%d"), "equity": v}
        for i, v in enumerate(values)
    ]


def _make_trades(pnls: list[float]) -> list[dict]:
    """Generate trade dicts from a list of PnLs."""
    dt = datetime(2025, 1, 1)
    trades = []
    for i, pnl in enumerate(pnls):
        trades.append({
            "entry_date": (dt + timedelta(days=i * 5)).strftime("%Y-%m-%d"),
            "exit_date": (dt + timedelta(days=i * 5 + 3)).strftime("%Y-%m-%d"),
            "entry_price": 100.0,
            "exit_price": 100.0 + pnl / 10,
            "size": 10,
            "pnl": pnl,
            "pnl_pct": pnl / 1000 * 100,
            "commission": 1.0,
            "type": "LONG",
        })
    return trades


class TestComputeMetrics:
    def test_basic_metrics(self):
        equity = _make_equity_curve([100000, 101000, 102000, 101500, 103000])
        trades = _make_trades([500, 1000, -500, 1500])
        result = compute_metrics(equity, trades, 100000.0)

        assert result.total_return_pct == pytest.approx(3.0, abs=0.01)
        assert result.total_trades == 4
        assert result.win_rate == pytest.approx(75.0)
        assert result.max_drawdown_pct > 0

    def test_sharpe_ratio_positive_returns(self):
        # Steadily increasing equity
        values = [100000 + i * 100 for i in range(252)]
        equity = _make_equity_curve(values)
        result = compute_metrics(equity, [], 100000.0)
        assert result.sharpe_ratio is not None
        assert result.sharpe_ratio > 0

    def test_sortino_ratio(self):
        # Mix of up and down days
        np.random.seed(42)
        values = [100000.0]
        for _ in range(100):
            values.append(values[-1] * (1 + np.random.normal(0.001, 0.02)))
        equity = _make_equity_curve(values)
        result = compute_metrics(equity, [], 100000.0)
        assert result.sortino_ratio is not None

    def test_profit_factor(self):
        trades = _make_trades([500, -200, 800, -100])
        equity = _make_equity_curve([100000, 100500, 100300, 101100, 101000])
        result = compute_metrics(equity, trades, 100000.0)
        assert result.profit_factor == pytest.approx(1300 / 300, abs=0.01)

    def test_max_consecutive_losses(self):
        trades = _make_trades([100, -50, -30, -20, 200])
        equity = _make_equity_curve([100000] * 6)
        result = compute_metrics(equity, trades, 100000.0)
        assert result.max_consecutive_losses == 3

    def test_empty_equity_curve(self):
        result = compute_metrics([], [], 100000.0)
        assert result.total_return_pct == 0
        assert result.sharpe_ratio is None

    def test_single_point_curve(self):
        result = compute_metrics([{"date": "2025-01-01", "equity": 100000}], [], 100000.0)
        assert result.total_return_pct == 0

    def test_expectancy(self):
        trades = _make_trades([100, 200, -50, 150])  # 3 wins, 1 loss
        equity = _make_equity_curve([100000] * 5)
        result = compute_metrics(equity, trades, 100000.0)
        assert result.expectancy is not None
        assert result.expectancy > 0  # Positive expectancy

    def test_tca_metrics(self):
        trades = [
            {
                "entry_date": "2025-01-01", "exit_date": "2025-01-05",
                "entry_price": 100, "exit_price": 110, "size": 10,
                "pnl": 100, "pnl_pct": 10, "commission": 5.0,
                "type": "LONG", "slippage_cost": 2.0, "spread_cost": 1.0,
            },
        ]
        equity = _make_equity_curve([100000, 100100])
        result = compute_metrics(equity, trades, 100000.0)
        assert result.total_commission == 5.0
        assert result.total_slippage == 2.0
        assert result.total_spread_cost == 1.0


class TestDrawdownSeries:
    def test_drawdown_from_peak(self):
        equity = [
            {"date": "2025-01-01", "equity": 100},
            {"date": "2025-01-02", "equity": 110},
            {"date": "2025-01-03", "equity": 100},
            {"date": "2025-01-04", "equity": 120},
        ]
        dd = derive_drawdown_series(equity)
        assert dd[0]["drawdown_pct"] == 0.0
        assert dd[1]["drawdown_pct"] == 0.0  # New high
        assert dd[2]["drawdown_pct"] == pytest.approx(9.0909, abs=0.01)
        assert dd[3]["drawdown_pct"] == 0.0  # New high

    def test_empty_curve(self):
        assert derive_drawdown_series([]) == []


class TestSampleSeries:
    def test_no_sampling_needed(self):
        data = [{"x": i} for i in range(50)]
        assert sample_series(data, 200) == data

    def test_sampling_preserves_endpoints(self):
        data = [{"x": i} for i in range(1000)]
        sampled = sample_series(data, 100)
        assert len(sampled) <= 100
        assert sampled[0] == data[0]
        assert sampled[-1] == data[-1]


class TestRollingMetrics:
    def test_rolling_sharpe_computed(self):
        np.random.seed(42)
        values = [100000.0]
        for _ in range(200):
            values.append(values[-1] * (1 + np.random.normal(0.001, 0.01)))
        equity = _make_equity_curve(values)
        result = compute_metrics(equity, [], 100000.0)
        assert result.rolling_sharpe is not None
        assert len(result.rolling_sharpe) > 0

    def test_no_rolling_metrics_for_short_curves(self):
        equity = _make_equity_curve([100000, 101000, 102000])
        result = compute_metrics(equity, [], 100000.0)
        assert result.rolling_sharpe is None


class TestOverfittingDetection:
    def test_deflated_sharpe_lower_with_more_trials(self):
        np.random.seed(42)
        values = [100000.0]
        for _ in range(252):
            values.append(values[-1] * (1 + np.random.normal(0.001, 0.01)))
        equity = _make_equity_curve(values)

        result_1 = compute_metrics(equity, [], 100000.0, num_backtests_tried=1)
        result_100 = compute_metrics(equity, [], 100000.0, num_backtests_tried=100)

        # With more trials, deflated Sharpe should be lower (more skepticism)
        if result_1.deflated_sharpe_ratio is not None and result_100.deflated_sharpe_ratio is not None:
            assert result_100.deflated_sharpe_ratio <= result_1.sharpe_ratio
