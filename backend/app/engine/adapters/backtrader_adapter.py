"""Legacy Backtrader adapter — wraps Backtrader execution behind the same interface as Engine.
Used when ENGINE_VERSION=backtrader.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import backtrader as bt
import numpy as np
import pandas as pd

from app.engine.analytics.metrics import (
    compute_metrics, derive_drawdown_series, sample_series, MetricsResult,
)
from app.engine.core.engine import EngineConfig, EngineResult


class _TradeRecorder(bt.Analyzer):
    """Records individual trades and equity curve (copy from legacy)."""

    def __init__(self):
        super().__init__()
        self.trades: list[dict] = []
        self.equity_curve: list[dict] = []
        self._open_sizes: dict[int, int] = {}

    def notify_trade(self, trade):
        if trade.isopen and trade.size != 0:
            self._open_sizes[trade.ref] = abs(trade.size)
        if not trade.isclosed:
            return

        is_long = bool(getattr(trade, "long", True))
        size = self._open_sizes.pop(trade.ref, 1)
        entry_price = round(trade.price, 4)

        if is_long:
            exit_price = round(entry_price + trade.pnl / size, 4)
        else:
            exit_price = round(entry_price - trade.pnl / size, 4)

        pnl_pct = (
            round(trade.pnlcomm / (size * entry_price) * 100, 4)
            if entry_price and size else 0.0
        )

        self.trades.append({
            "entry_date": bt.num2date(trade.dtopen).strftime("%Y-%m-%d"),
            "exit_date": bt.num2date(trade.dtclose).strftime("%Y-%m-%d"),
            "entry_price": entry_price,
            "exit_price": exit_price,
            "size": size,
            "pnl": round(trade.pnl, 2),
            "pnl_pct": pnl_pct,
            "commission": round(trade.commission, 4),
            "type": "LONG" if is_long else "SHORT",
        })

    def next(self):
        self.equity_curve.append({
            "date": self.data.datetime.date(0).strftime("%Y-%m-%d"),
            "equity": round(self.strategy.broker.getvalue(), 2),
        })

    def get_analysis(self):
        return {"trades": self.trades, "equity_curve": self.equity_curve}


class BacktraderEngine:
    """Legacy Backtrader adapter compatible with Engine.

    Used when ENGINE_VERSION=backtrader.
    """

    def __init__(self, config: EngineConfig | None = None):
        self.config = config or EngineConfig()

    def run(
        self,
        strategy_cls: type,
        data: pd.DataFrame,
        symbol: str = "",
        additional_data: dict[str, pd.DataFrame] | None = None,
    ) -> EngineResult:
        """Run a backtest using Backtrader."""
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(self.config.initial_capital)
        cerebro.broker.setcommission(commission=self.config.commission_rate)
        cerebro.broker.set_slippage_perc(self.config.slippage_pct / 100)

        # Data feed
        if data.index.tz is not None:
            data.index = data.index.tz_localize(None)
        feed = bt.feeds.PandasData(dataname=data, name=symbol)
        cerebro.adddata(feed)

        if additional_data:
            for sym, df in additional_data.items():
                if df.index.tz is not None:
                    df.index = df.index.tz_localize(None)
                cerebro.adddata(bt.feeds.PandasData(dataname=df, name=sym))

        # Analyzers
        cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe")
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
        cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
        cerebro.addanalyzer(_TradeRecorder, _name="recorder")

        cerebro.addstrategy(strategy_cls)
        results = cerebro.run()
        strat = results[0]

        # Extract results
        final_value = cerebro.broker.getvalue()
        total_return = (final_value - self.config.initial_capital) / self.config.initial_capital * 100

        recorder = strat.analyzers.recorder.get_analysis()
        trades_list = recorder["trades"]
        equity_curve = recorder["equity_curve"]

        metrics = compute_metrics(
            equity_curve=equity_curve,
            trades=trades_list,
            initial_capital=self.config.initial_capital,
        )

        return EngineResult(
            config=self.config,
            metrics=metrics,
            equity_curve=equity_curve,
            drawdown_series=derive_drawdown_series(equity_curve),
            trades=trades_list,
            orders=[],
            final_value=round(final_value, 2),
            initial_capital=self.config.initial_capital,
            total_return_pct=round(total_return, 4),
        )
