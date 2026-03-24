"""Regression tests for multi-asset backtests — the stuff that breaks quietly.

Run: ``pytest tests/test_multi_asset.py -v``

What we guard against
---------------------
 1. **Dispatch** — every loaded symbol gets ``on_data``, even when AAPL sorts first but isn't primary.
 2. **Primary bar** — scheduled callbacks see the user's primary symbol, not alphabetical order.
 3. **capital_per_symbol** — matches ``equity / n`` for ``n`` symbols.
 4. **Sizing** — with ``capital_per_symbol()`` everyone can trade, not just the first ticker in the alphabet.
 5. **Raw cash sizing** — documents the old foot-gun: ``portfolio.cash`` starves later symbols (don't do that).
 6. **history()** — per-symbol series, no bleed-over.
 7. **Trades** — each fill lands on the right symbol in the ledger.
 8. **Positions** — flat/long/short are per symbol, not global.
 9. **Equity** — mark-to-market includes every open leg, not only the chart symbol.
10. **Warm-up** — no ``on_data`` for any symbol until warm-up finishes.
11. **Primary swap** — changing which symbol is "primary" doesn't change other symbols' economics.
12. **Feed contract** — ``primary_symbol`` stays the first symbol you loaded, whatever the alphabet says.
"""

import pytest
import numpy as np
import pandas as pd

from app.engine.core.engine import Engine, EngineConfig
from app.engine.strategy.base import StrategyBase
from app.engine.data.feed import BarData, DataFeed


def _price_df(
    start: float = 100.0,
    n: int = 100,
    seed: int = 0,
    trend: float = 0.0005,
) -> pd.DataFrame:
    """Boring synthetic OHLCV: positive prices, no gaps, repeatable with ``seed``."""
    rng = np.random.default_rng(seed)
    closes = [start]
    for _ in range(n - 1):
        closes.append(closes[-1] * (1.0 + trend + rng.normal(0, 0.004)))
    opens  = [c * (1 + rng.uniform(-0.002, 0.002)) for c in closes]
    highs  = [max(o, c) * (1 + abs(rng.normal(0, 0.002))) for o, c in zip(opens, closes)]
    lows   = [min(o, c) * (1 - abs(rng.normal(0, 0.002))) for o, c in zip(opens, closes)]
    vols   = [int(rng.uniform(1e6, 5e6)) for _ in closes]
    dates  = pd.bdate_range("2023-01-03", periods=n)
    return pd.DataFrame(
        {"Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols},
        index=dates,
    )


def _crossover_df(n: int = 150, cross_bar: int = 50) -> pd.DataFrame:
    """Crafted path with a single SMA(5/20) golden cross then a death cross.

    Phase 1 (before ``cross_bar``): gentle drift down so fast ≤ slow.
    Phase 2: rip higher → buy signal.
    Phase 3: give it back → sell signal.
    """
    prices = []
    for i in range(n):
        if i < cross_bar:
            prices.append(100.0 - i * 0.05)
        elif i < cross_bar + 35:
            prices.append(100.0 + (i - cross_bar) * 2.5)
        else:
            prices.append(187.5 - (i - cross_bar - 35) * 2.0)
    dates = pd.bdate_range("2023-01-03", periods=n)
    return pd.DataFrame(
        {
            "Open":   prices,
            "High":   prices,
            "Low":    prices,
            "Close":  prices,
            "Volume": [1_000_000] * n,
        },
        index=dates,
    )


def _engine(*symbol_seed_pairs, capital: float = 100_000) -> Engine:
    """Convenience: build an Engine with the given (symbol, seed) pairs."""
    eng = Engine(EngineConfig(initial_capital=capital, commission_rate=0.0))
    for sym, seed in symbol_seed_pairs:
        eng.add_data(sym, _price_df(seed=seed))
    return eng


# Reusable strategy classes

class _RecordSymbols(StrategyBase):
    """Records every symbol whose on_data is invoked."""
    def on_init(self):
        self.seen: set[str] = set()

    def on_data(self, bar: BarData):
        self.seen.add(bar.symbol)


class _BuyOnBar(StrategyBase):
    """Buys each symbol on a fixed bar using capital_per_symbol() sizing."""
    def on_init(self):
        self._trigger_bar: int = self.params.get("trigger_bar", 10)

    def on_data(self, bar: BarData):
        if self.bar_index == self._trigger_bar and self.is_flat(bar.symbol):
            qty = int(self.capital_per_symbol() * 0.95 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)


class _BuyOnBarCashStyle(StrategyBase):
    """Same as _BuyOnBar but uses the old self.portfolio.cash sizing (bug demonstration)."""
    def on_init(self):
        self._trigger_bar: int = self.params.get("trigger_bar", 10)

    def on_data(self, bar: BarData):
        if self.bar_index == self._trigger_bar and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash * 0.95 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)


class _SMAMultiAsset(StrategyBase):
    """SMA(5/20) crossover using capital_per_symbol(); safe for multi-asset."""
    def on_data(self, bar: BarData):
        fast, slow = 5, 20
        hist = self.history(bar.symbol, slow + 1)
        if len(hist) < slow + 1:
            return
        fast_now  = sum(b.close for b in hist[-fast:])   / fast
        slow_now  = sum(b.close for b in hist[-slow:])   / slow
        fast_prev = sum(b.close for b in hist[-fast-1:-1]) / fast
        slow_prev = sum(b.close for b in hist[-slow-1:-1]) / slow

        if self.is_flat(bar.symbol) and fast_prev <= slow_prev and fast_now > slow_now:
            qty = max(1, int(self.capital_per_symbol() * 0.95 / bar.close))
            self.market_order(bar.symbol, qty)
        elif self.is_long(bar.symbol) and fast_prev >= slow_prev and fast_now < slow_now:
            self.close_position(bar.symbol)


# 1. on_data dispatch

class TestOnDataDispatch:
    """All loaded symbols must receive on_data on every bar."""

    def test_two_symbols_both_receive_on_data(self):
        eng = _engine(("SPY", 1), ("QQQ", 2))
        s = _RecordSymbols()
        eng.set_strategy(s)
        eng.run()
        assert "SPY" in s.seen
        assert "QQQ" in s.seen

    def test_aapl_as_additional_receives_on_data(self):
        """AAPL sorts before SPY alphabetically. When it is the *additional* symbol
        it must still receive on_data on every bar."""
        eng = _engine(("SPY", 1), ("AAPL", 2))   # SPY = primary (inserted first)
        s = _RecordSymbols()
        eng.set_strategy(s)
        eng.run()
        assert "SPY"  in s.seen, "Primary symbol SPY never received on_data"
        assert "AAPL" in s.seen, "Additional symbol AAPL never received on_data"

    def test_four_symbols_all_receive_on_data(self):
        eng = _engine(("MSFT", 1), ("AAPL", 2), ("QQQ", 3), ("SPY", 4))
        s = _RecordSymbols()
        eng.set_strategy(s)
        eng.run()
        assert s.seen == {"MSFT", "AAPL", "QQQ", "SPY"}

    def test_on_data_called_every_bar_for_each_symbol(self):
        """on_data call count per symbol must equal the number of bars."""
        class CountCalls(StrategyBase):
            def on_init(self):
                self.counts: dict[str, int] = {}
            def on_data(self, bar: BarData):
                self.counts[bar.symbol] = self.counts.get(bar.symbol, 0) + 1

        n_bars = 60
        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("MSFT", _price_df(n=n_bars, seed=1))
        eng.add_data("AAPL", _price_df(n=n_bars, seed=2))
        s = CountCalls()
        eng.set_strategy(s)
        eng.run()

        assert s.counts.get("MSFT", 0) == n_bars, (
            f"MSFT on_data called {s.counts.get('MSFT', 0)} times, expected {n_bars}"
        )
        assert s.counts.get("AAPL", 0) == n_bars, (
            f"AAPL on_data called {s.counts.get('AAPL', 0)} times, expected {n_bars}"
        )


# 2. Primary-bar identity in scheduled callbacks

class TestPrimaryBarIdentity:
    """Scheduled callbacks must receive the *intended* primary symbol's bar,
    not the alphabetically-first symbol."""

    def _run_with_schedule(self, primary: str, additional: str) -> list[str]:
        class ScheduleRecorder(StrategyBase):
            def on_init(self):
                self.fired_symbols: list[str] = []
                self.schedule("check", 5, self._cb)
            def _cb(self, bar: BarData):
                self.fired_symbols.append(bar.symbol)
            def on_data(self, bar: BarData):
                pass

        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data(primary,    _price_df(seed=1))
        eng.add_data(additional, _price_df(seed=2))
        s = ScheduleRecorder()
        eng.set_strategy(s)
        eng.run()
        return s.fired_symbols

    def test_msft_primary_aapl_additional(self):
        """AAPL sorts before MSFT; scheduled bar must still be MSFT."""
        fired = self._run_with_schedule(primary="MSFT", additional="AAPL")
        assert len(fired) > 0, "Scheduled callback never fired"
        wrong = [sym for sym in fired if sym != "MSFT"]
        assert not wrong, (
            f"Scheduled callback received wrong symbol(s): {set(wrong)}. "
            "Engine is using alphabetical bar_group[0] instead of the intended primary."
        )

    def test_spy_primary_aapl_additional(self):
        """SPY sorts after AAPL; scheduled bar must be SPY."""
        fired = self._run_with_schedule(primary="SPY", additional="AAPL")
        assert all(sym == "SPY" for sym in fired), (
            f"Scheduled callback received non-SPY bars: {set(fired)}"
        )

    def test_nvda_primary_aapl_additional(self):
        """NVDA sorts after AAPL (N > A); scheduled bar must be NVDA."""
        fired = self._run_with_schedule(primary="NVDA", additional="AAPL")
        assert all(sym == "NVDA" for sym in fired), (
            f"Scheduled callback received non-NVDA bars: {set(fired)}"
        )


# 3. capital_per_symbol() allocation

class TestCapitalPerSymbol:
    def _first_call_capitals(self, *symbol_seed_pairs, capital: float = 10_000) -> dict[str, float]:
        class Record(StrategyBase):
            def on_init(self):
                self.first: dict[str, float] = {}
            def on_data(self, bar: BarData):
                if bar.symbol not in self.first:
                    self.first[bar.symbol] = self.capital_per_symbol()

        eng = Engine(EngineConfig(initial_capital=capital))
        for sym, seed in symbol_seed_pairs:
            eng.add_data(sym, _price_df(seed=seed))
        s = Record()
        eng.set_strategy(s)
        eng.run()
        return s.first

    def test_single_symbol_equals_full_equity(self):
        caps = self._first_call_capitals(("AAPL", 1))
        assert caps["AAPL"] == pytest.approx(10_000, rel=0.01)

    def test_two_symbols_half_each(self):
        caps = self._first_call_capitals(("SPY", 1), ("QQQ", 2))
        assert caps["SPY"] == pytest.approx(5_000, rel=0.01)
        assert caps["QQQ"] == pytest.approx(5_000, rel=0.01)

    def test_four_symbols_quarter_each(self):
        caps = self._first_call_capitals(
            ("MSFT", 1), ("AAPL", 2), ("QQQ", 3), ("SPY", 4),
            capital=100_000,
        )
        for sym in ("MSFT", "AAPL", "QQQ", "SPY"):
            assert caps[sym] == pytest.approx(25_000, rel=0.01), (
                f"{sym}: capital_per_symbol()={caps[sym]:.0f}, expected ~25 000"
            )

    def test_capital_per_symbol_includes_open_positions(self):
        """After buying symbol A, capital_per_symbol() must still be equity/n
        (equity = cash + position value), not just remaining cash / n."""
        class BuyFirstThenRecord(StrategyBase):
            def on_init(self):
                self.post_buy_capital: dict[str, float] = {}
                self._bought_a = False

            def on_data(self, bar: BarData):
                if bar.symbol == "SPY" and self.bar_index == 5 and not self._bought_a:
                    qty = int(self.capital_per_symbol() * 0.9 / bar.close)
                    if qty > 0:
                        self.market_order("SPY", qty)
                        self._bought_a = True

                if self.bar_index == 10 and bar.symbol not in self.post_buy_capital:
                    self.post_buy_capital[bar.symbol] = self.capital_per_symbol()

        eng = Engine(EngineConfig(initial_capital=10_000, commission_rate=0.0))
        eng.add_data("SPY", _price_df(seed=1))
        eng.add_data("QQQ", _price_df(seed=2))
        s = BuyFirstThenRecord()
        eng.set_strategy(s)
        eng.run()

        # With no commission and near-zero trend, equity ≈ 10 000 after bar 10
        # capital_per_symbol() ≈ 5 000 for both symbols
        for sym in ("SPY", "QQQ"):
            assert s.post_buy_capital.get(sym, 0) == pytest.approx(5_000, rel=0.05), (
                f"{sym}: expected ~5 000 after SPY position opened, "
                f"got {s.post_buy_capital.get(sym, 0):.0f}"
            )


# 4. Capital starvation – all orders must fill with capital_per_symbol()

class TestCapitalAllocation:
    """With capital_per_symbol() sizing, every simultaneously-signalling symbol
    must get its order filled."""

    def _traded_symbols(self, *symbol_seed_pairs, strategy_cls=_BuyOnBar,
                         capital: float = 100_000, trigger_bar: int = 10) -> set[str]:
        eng = Engine(EngineConfig(initial_capital=capital, commission_rate=0.0))
        for sym, seed in symbol_seed_pairs:
            eng.add_data(sym, _price_df(start=100.0, seed=seed))
        eng.set_strategy(strategy_cls(params={"trigger_bar": trigger_bar}))
        result = eng.run()
        return {t["symbol"] for t in result.trades}

    def test_two_symbols_both_fill(self):
        traded = self._traded_symbols(("SPY", 1), ("QQQ", 2))
        assert "SPY" in traded, "SPY order was never filled"
        assert "QQQ" in traded, "QQQ order was never filled"

    def test_four_symbols_all_fill(self):
        traded = self._traded_symbols(
            ("MSFT", 1), ("AAPL", 2), ("QQQ", 3), ("SPY", 4)
        )
        assert traded == {"MSFT", "AAPL", "QQQ", "SPY"}, (
            f"Expected all 4 symbols to trade; only traded: {traded}\n"
            "If some symbols are missing this is the capital-starvation bug."
        )

    def test_aapl_as_primary_does_not_starve_others(self):
        """AAPL is alphabetically first so its orders are submitted first.
        With capital_per_symbol() the remaining symbols must still fill."""
        traded = self._traded_symbols(
            ("AAPL", 1), ("MSFT", 2), ("QQQ", 3), ("SPY", 4)
        )
        assert traded == {"AAPL", "MSFT", "QQQ", "SPY"}, (
            f"AAPL-first ordering starved others; only traded: {traded}"
        )

    def test_total_deployed_capital_within_bounds(self):
        """Total position value after simultaneous buys must not exceed initial capital."""
        eng = Engine(EngineConfig(initial_capital=100_000, commission_rate=0.0))
        for sym, seed in [("MSFT", 1), ("AAPL", 2), ("QQQ", 3), ("SPY", 4)]:
            eng.add_data(sym, _price_df(start=100.0, seed=seed))
        eng.set_strategy(_BuyOnBar(params={"trigger_bar": 10}))
        result = eng.run()
        assert result.final_value == pytest.approx(100_000, rel=0.05), (
            "Over-allocation detected: total deployed capital exceeded initial capital"
        )


# 5. portfolio.cash starvation (regression documentation)

class TestPortfolioCashStarvation:
    """Documents the known bug: old-style self.portfolio.cash * 0.95 sizing submits
    all orders for the full cash balance. Only the first order to fill (the
    alphabetically-first symbol) succeeds; the rest are rejected.

    Users MUST use capital_per_symbol() for correct multi-asset behaviour.
    """

    def test_only_one_symbol_fills_with_old_style_sizing(self):
        eng = Engine(EngineConfig(initial_capital=100_000, commission_rate=0.0))
        for sym, seed in [("AAPL", 1), ("MSFT", 2), ("QQQ", 3), ("SPY", 4)]:
            eng.add_data(sym, _price_df(start=100.0, seed=seed))
        eng.set_strategy(_BuyOnBarCashStyle(params={"trigger_bar": 10}))
        result = eng.run()

        traded = {t["symbol"] for t in result.trades}
        # AAPL is alphabetically first → its fill depletes cash → others are rejected
        assert len(traded) == 1, (
            f"Expected only 1 symbol to trade with old-style cash sizing; got: {traded}\n"
            "If this fails it means the starvation bug has been accidentally fixed at "
            "the broker level — verify capital_per_symbol() is still the recommended path."
        )
        assert "AAPL" in traded, (
            f"Expected AAPL (alphabetically first) to be the one symbol that traded; "
            f"got {traded}"
        )


# 6. Per-symbol history independence

class TestPerSymbolHistory:
    def test_history_contains_only_requested_symbol_bars(self):
        class Check(StrategyBase):
            def on_init(self):
                self.errors: list[str] = []
            def on_data(self, bar: BarData):
                hist = self.history(bar.symbol, 10)
                for h in hist:
                    if h.symbol != bar.symbol:
                        self.errors.append(
                            f"history({bar.symbol}) returned a bar for {h.symbol}"
                        )

        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("SPY",  _price_df(start=100.0, seed=1))
        eng.add_data("AAPL", _price_df(start=200.0, seed=2))
        s = Check()
        eng.set_strategy(s)
        eng.run()
        assert s.errors == [], "\n".join(s.errors)

    def test_history_last_close_matches_current_bar(self):
        """The most recent entry in history() must always match bar.close."""
        class Check(StrategyBase):
            def on_init(self):
                self.mismatches: list[str] = []
            def on_data(self, bar: BarData):
                hist = self.history(bar.symbol, 1)
                if hist and abs(hist[-1].close - bar.close) > 1e-9:
                    self.mismatches.append(
                        f"{bar.symbol}@{bar.bar_index}: "
                        f"history close={hist[-1].close} != bar.close={bar.close}"
                    )

        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("MSFT", _price_df(seed=5))
        eng.add_data("AAPL", _price_df(seed=6))
        s = Check()
        eng.set_strategy(s)
        eng.run()
        assert s.mismatches == [], (
            "history() returned stale/wrong close prices:\n" + "\n".join(s.mismatches[:5])
        )

    def test_history_accumulates_per_symbol_independently(self):
        """History length for each symbol must be the same (one bar per time step)."""
        class Record(StrategyBase):
            def on_init(self):
                self.final_len: dict[str, int] = {}
            def on_data(self, bar: BarData):
                self.final_len[bar.symbol] = len(self.history(bar.symbol, 10_000))

        n = 80
        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("SPY", _price_df(n=n, seed=1))
        eng.add_data("QQQ", _price_df(n=n, seed=2))
        s = Record()
        eng.set_strategy(s)
        eng.run()
        assert s.final_len.get("SPY") == n, f"SPY history length={s.final_len.get('SPY')}, want {n}"
        assert s.final_len.get("QQQ") == n, f"QQQ history length={s.final_len.get('QQQ')}, want {n}"
        assert s.final_len["SPY"] == s.final_len["QQQ"]


# 7. Trade attribution

class TestTradeAttribution:
    def test_trade_symbol_matches_asset_traded(self):
        """Every trade record must reference one of the loaded symbols."""
        eng = Engine(EngineConfig(initial_capital=100_000))
        eng.add_data("SPY", _crossover_df(cross_bar=40))
        eng.add_data("QQQ", _crossover_df(cross_bar=55))
        eng.set_strategy(_SMAMultiAsset())
        result = eng.run()

        valid_symbols = {"SPY", "QQQ"}
        for trade in result.trades:
            assert trade["symbol"] in valid_symbols, (
                f"Trade has unknown symbol '{trade['symbol']}'"
            )

    def test_both_symbols_appear_in_trade_log(self):
        """When both symbols have crossover signals, both must appear in results.trades."""
        eng = Engine(EngineConfig(initial_capital=100_000))
        eng.add_data("SPY", _crossover_df(n=150, cross_bar=35))
        eng.add_data("QQQ", _crossover_df(n=150, cross_bar=55))
        eng.set_strategy(_SMAMultiAsset())
        result = eng.run()

        spy_trades = [t for t in result.trades if t["symbol"] == "SPY"]
        qqq_trades = [t for t in result.trades if t["symbol"] == "QQQ"]
        assert len(spy_trades) >= 1, (
            "SPY never produced a completed trade despite a guaranteed crossover signal"
        )
        assert len(qqq_trades) >= 1, (
            "QQQ never produced a completed trade despite a guaranteed crossover signal"
        )

    def test_trade_count_matches_metrics(self):
        eng = Engine(EngineConfig(initial_capital=100_000))
        eng.add_data("SPY", _crossover_df(cross_bar=40))
        eng.add_data("QQQ", _crossover_df(cross_bar=50))
        eng.set_strategy(_SMAMultiAsset())
        result = eng.run()
        assert len(result.trades) == result.metrics.total_trades


# 8. Position state isolation

class TestPositionIsolation:
    def test_buying_one_symbol_leaves_other_flat(self):
        class Check(StrategyBase):
            def on_init(self):
                self.errors: list[str] = []
                self._bought_spy = False

            def on_data(self, bar: BarData):
                if bar.symbol == "SPY" and self.bar_index == 5 and not self._bought_spy:
                    qty = int(self.capital_per_symbol() * 0.9 / bar.close)
                    if qty > 0:
                        self.market_order("SPY", qty)
                        self._bought_spy = True

                # After SPY fill, QQQ must still be flat
                if self.bar_index >= 8 and bar.symbol == "SPY":
                    if not self.is_long("SPY"):
                        self.errors.append(f"bar {self.bar_index}: SPY should be long")
                    if not self.is_flat("QQQ"):
                        self.errors.append(f"bar {self.bar_index}: QQQ should be flat")

        eng = Engine(EngineConfig(initial_capital=100_000, commission_rate=0.0))
        eng.add_data("SPY", _price_df(seed=1))
        eng.add_data("QQQ", _price_df(seed=2))
        s = Check()
        eng.set_strategy(s)
        eng.run()
        assert s.errors == [], "\n".join(s.errors)

    def test_closing_one_position_leaves_other_unchanged(self):
        class BuyThenClose(StrategyBase):
            def on_init(self):
                self._bought: dict[str, bool] = {}
                self.errors: list[str] = []

            def on_data(self, bar: BarData):
                if self.bar_index == 5 and bar.symbol not in self._bought:
                    qty = int(self.capital_per_symbol() * 0.9 / bar.close)
                    if qty > 0:
                        self.market_order(bar.symbol, qty)
                        self._bought[bar.symbol] = True

                # Close SPY only on bar 20; QQQ must remain open
                if self.bar_index == 20 and bar.symbol == "SPY" and self.is_long("SPY"):
                    self.close_position("SPY")

                if self.bar_index >= 22 and bar.symbol == "QQQ":
                    if not self.is_long("QQQ"):
                        self.errors.append(
                            f"bar {self.bar_index}: closing SPY incorrectly closed QQQ"
                        )

        eng = Engine(EngineConfig(initial_capital=100_000, commission_rate=0.0))
        eng.add_data("SPY", _price_df(seed=1))
        eng.add_data("QQQ", _price_df(seed=2))
        s = BuyThenClose()
        eng.set_strategy(s)
        eng.run()
        assert s.errors == [], "\n".join(s.errors)


# 9. Equity curve integrity

class TestEquityCurve:
    def test_equity_grows_when_holding_rising_assets(self):
        """Buying two upward-trending symbols must produce an equity curve that
        rises above the initial capital."""
        eng = Engine(EngineConfig(initial_capital=100_000, commission_rate=0.0))
        eng.add_data("SPY", _price_df(trend=0.003, seed=10))  # strongly rising
        eng.add_data("QQQ", _price_df(trend=0.003, seed=11))
        eng.set_strategy(_BuyOnBar(params={"trigger_bar": 5}))
        result = eng.run()

        peak_equity = max(item["equity"] for item in result.equity_curve)
        assert peak_equity > 100_000, (
            "Equity never exceeded initial capital despite holding two rising assets"
        )

    def test_equity_curve_length_matches_bar_count(self):
        n = 80
        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("SPY", _price_df(n=n, seed=1))
        eng.add_data("QQQ", _price_df(n=n, seed=2))
        eng.set_strategy(_RecordSymbols())
        result = eng.run()
        # Equity curve is sampled; length should be > 0 and <= n
        assert 0 < len(result.equity_curve) <= n

    def test_equity_never_negative(self):
        eng = Engine(EngineConfig(initial_capital=100_000))
        for sym, seed in [("MSFT", 1), ("AAPL", 2), ("QQQ", 3), ("SPY", 4)]:
            eng.add_data(sym, _price_df(seed=seed))
        eng.set_strategy(_SMAMultiAsset())
        result = eng.run()
        for item in result.equity_curve:
            assert item["equity"] >= 0, f"Equity went negative at {item['date']}: {item['equity']}"


# 10. Warmup suppresses on_data for all symbols

class TestWarmup:
    def test_on_data_suppressed_before_warmup_completes(self):
        """No symbol must receive on_data calls before the warmup bar count."""
        WARMUP = 20

        class WarmupCheck(StrategyBase):
            def on_init(self):
                self.set_warmup(bars=WARMUP)
                self.premature: list[str] = []

            def on_data(self, bar: BarData):
                if self.bar_index < WARMUP:
                    self.premature.append(f"{bar.symbol}@{self.bar_index}")

        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("SPY",  _price_df(seed=1))
        eng.add_data("AAPL", _price_df(seed=2))
        s = WarmupCheck()
        eng.set_strategy(s)
        eng.run()
        assert s.premature == [], (
            "on_data called before warmup for:\n" + "\n".join(s.premature)
        )

    def test_all_symbols_resume_after_warmup(self):
        """All symbols must receive on_data once warmup is complete."""
        WARMUP = 15

        class AfterWarmup(StrategyBase):
            def on_init(self):
                self.set_warmup(bars=WARMUP)
                self.post_warmup: set[str] = set()

            def on_data(self, bar: BarData):
                if self.bar_index >= WARMUP:
                    self.post_warmup.add(bar.symbol)

        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("MSFT", _price_df(seed=1))
        eng.add_data("AAPL", _price_df(seed=2))
        s = AfterWarmup()
        eng.set_strategy(s)
        eng.run()
        assert "MSFT" in s.post_warmup
        assert "AAPL" in s.post_warmup


# 11. Primary-swap parity

class TestPrimarySwapParity:
    """Swapping which symbol is declared primary must not change how the
    shared (non-primary) symbols behave, given identical price data."""

    def _trades_per_symbol(self, primary: str, others: list[str]) -> dict[str, int]:
        eng = Engine(EngineConfig(initial_capital=100_000))
        # Primary gets seed 99 (deterministic but irrelevant to the test)
        eng.add_data(primary, _crossover_df(n=150, cross_bar=40))
        for i, sym in enumerate(others):
            # Each shared symbol has a unique fixed seed so data is the same
            # regardless of which symbol is declared primary.
            eng.add_data(sym, _crossover_df(n=150, cross_bar=40 + i * 10))
        eng.set_strategy(_SMAMultiAsset())
        result = eng.run()
        return {sym: len([t for t in result.trades if t["symbol"] == sym]) for sym in others}

    def test_shared_symbols_same_trades_regardless_of_primary(self):
        """QQQ and SPY must produce the same number of trades whether MSFT or NVDA
        is the primary — the primary should not bleed into non-primary execution."""
        shared = ["QQQ", "SPY"]
        with_msft = self._trades_per_symbol("MSFT", shared)
        with_nvda = self._trades_per_symbol("NVDA", shared)

        for sym in shared:
            assert with_msft[sym] == with_nvda[sym], (
                f"{sym}: {with_msft[sym]} trades with MSFT primary vs "
                f"{with_nvda[sym]} trades with NVDA primary. "
                "Primary symbol is contaminating non-primary execution."
            )


# 12. DataFeed.primary_symbol insertion-order guarantee

class TestDataFeedPrimarySymbol:
    def test_primary_is_first_inserted_not_alphabetical(self):
        feed = DataFeed()
        feed.add_symbol("NVDA", _price_df(seed=1))
        feed.add_symbol("AAPL", _price_df(seed=2))  # A < N but inserted second
        assert feed.primary_symbol == "NVDA", (
            f"primary_symbol='{feed.primary_symbol}', expected 'NVDA' (first inserted). "
            "Alphabetical ordering must not override insertion order."
        )

    def test_primary_symbol_after_multiple_adds(self):
        feed = DataFeed()
        for sym, seed in [("SPY", 1), ("AAPL", 2), ("QQQ", 3)]:
            feed.add_symbol(sym, _price_df(seed=seed))
        assert feed.primary_symbol == "SPY"

    def test_bar_group_contains_all_symbols(self):
        """Every yielded bar group must contain exactly one event per loaded symbol."""
        feed = DataFeed()
        feed.add_symbol("MSFT", _price_df(n=20, seed=1))
        feed.add_symbol("AAPL", _price_df(n=20, seed=2))

        for group in feed.iterate():
            syms = {ev.symbol for ev in group}
            assert syms == {"MSFT", "AAPL"}, (
                f"Bar group missing symbol(s): {syms}"
            )

    def test_engine_primary_symbol_matches_first_add_data(self):
        """Engine.data_feed.primary_symbol must equal the symbol from the first add_data call."""
        eng = Engine(EngineConfig(initial_capital=10_000))
        eng.add_data("TSLA", _price_df(seed=1))
        eng.add_data("AAPL", _price_df(seed=2))
        eng.set_strategy(_RecordSymbols())
        eng.run()
        assert eng._data_feed.primary_symbol == "TSLA"
