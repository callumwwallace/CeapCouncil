"""Bar consolidators : aggregate lower-timeframe bars into higher timeframes.

Supports:
- Time-based consolidation (1m -> 5m, 5m -> 1h, etc.)
- Custom period consolidation (3h, 2d, etc.)
- Renko bars (price-based)
- Range bars (fixed price range)

Usage:
    from app.engine.data.consolidators import TimeConsolidator, RenkoConsolidator

    class MyStrategy(StrategyBase):
        def on_init(self):
            self.hourly = TimeConsolidator(minutes=60, callback=self.on_hourly)
            self.renko = RenkoConsolidator(brick_size=10.0, callback=self.on_renko)

        def on_data(self, bar):
            self.hourly.update(bar)
            self.renko.update(bar)

        def on_hourly(self, bar):
            # called when a 1-hour bar completes
            pass
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from app.engine.data.feed import BarData


@dataclass
class ConsolidatedBar:
    """A consolidated OHLCV bar."""
    symbol: str
    start_time: datetime
    end_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    bar_count: int = 0

    def to_bar_data(self, bar_index: int = 0) -> BarData:
        return BarData(
            symbol=self.symbol,
            timestamp=self.end_time,
            open=self.open,
            high=self.high,
            low=self.low,
            close=self.close,
            volume=self.volume,
            bar_index=bar_index,
        )


class TimeConsolidator:
    """Consolidates bars into a fixed time period.

    E.g., feed 1-minute bars, get 5-minute bars out.
    """

    def __init__(
        self,
        minutes: int = 0,
        hours: int = 0,
        days: int = 0,
        callback: Callable[[ConsolidatedBar], None] | None = None,
    ):
        self._period = timedelta(minutes=minutes, hours=hours, days=days)
        if self._period.total_seconds() <= 0:
            raise ValueError("Consolidation period must be positive")
        self._callback = callback
        self._current: ConsolidatedBar | None = None
        self._period_end: datetime | None = None
        self._completed: list[ConsolidatedBar] = []
        self._bar_index = 0

    def update(self, bar: BarData) -> ConsolidatedBar | None:
        """Feed a bar. Returns completed consolidated bar if period ended."""
        if self._current is None:
            self._start_new_bar(bar)
            return None

        if bar.timestamp >= self._period_end:
            completed = self._current
            self._completed.append(completed)
            self._bar_index += 1
            if self._callback:
                self._callback(completed)
            self._start_new_bar(bar)
            return completed

        self._current.high = max(self._current.high, bar.high)
        self._current.low = min(self._current.low, bar.low)
        self._current.close = bar.close
        self._current.volume += bar.volume
        self._current.bar_count += 1
        self._current.end_time = bar.timestamp
        return None

    def _start_new_bar(self, bar: BarData) -> None:
        self._current = ConsolidatedBar(
            symbol=bar.symbol,
            start_time=bar.timestamp,
            end_time=bar.timestamp,
            open=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
            volume=bar.volume,
            bar_count=1,
        )
        self._period_end = bar.timestamp + self._period

    @property
    def history(self) -> list[ConsolidatedBar]:
        return list(self._completed)

    @property
    def current(self) -> ConsolidatedBar | None:
        return self._current


class BarCountConsolidator:
    """Consolidates every N bars into one."""

    def __init__(self, count: int = 5, callback: Callable[[ConsolidatedBar], None] | None = None):
        self._count = count
        self._callback = callback
        self._current: ConsolidatedBar | None = None
        self._bars_in_current = 0
        self._completed: list[ConsolidatedBar] = []

    def update(self, bar: BarData) -> ConsolidatedBar | None:
        if self._current is None:
            self._current = ConsolidatedBar(
                symbol=bar.symbol, start_time=bar.timestamp, end_time=bar.timestamp,
                open=bar.open, high=bar.high, low=bar.low, close=bar.close,
                volume=bar.volume, bar_count=1,
            )
            self._bars_in_current = 1
        else:
            self._current.high = max(self._current.high, bar.high)
            self._current.low = min(self._current.low, bar.low)
            self._current.close = bar.close
            self._current.volume += bar.volume
            self._current.bar_count += 1
            self._current.end_time = bar.timestamp
            self._bars_in_current += 1

        if self._bars_in_current >= self._count:
            completed = self._current
            self._completed.append(completed)
            if self._callback:
                self._callback(completed)
            self._current = None
            self._bars_in_current = 0
            return completed
        return None

    @property
    def history(self) -> list[ConsolidatedBar]:
        return list(self._completed)


class RenkoConsolidator:
    """Renko bars : new bar only when price moves by brick_size."""

    def __init__(self, brick_size: float, callback: Callable[[ConsolidatedBar], None] | None = None):
        self.brick_size = brick_size
        self._callback = callback
        self._last_close: float | None = None
        self._completed: list[ConsolidatedBar] = []

    def update(self, bar: BarData) -> list[ConsolidatedBar]:
        """Feed a bar. May return 0 or more Renko bricks."""
        if self._last_close is None:
            self._last_close = bar.close
            return []

        new_bricks: list[ConsolidatedBar] = []
        diff = bar.close - self._last_close

        while abs(diff) >= self.brick_size:
            direction = 1 if diff > 0 else -1
            brick_open = self._last_close
            brick_close = self._last_close + direction * self.brick_size

            brick = ConsolidatedBar(
                symbol=bar.symbol,
                start_time=bar.timestamp,
                end_time=bar.timestamp,
                open=brick_open,
                high=max(brick_open, brick_close),
                low=min(brick_open, brick_close),
                close=brick_close,
                volume=bar.volume,
                bar_count=1,
            )
            new_bricks.append(brick)
            self._completed.append(brick)
            if self._callback:
                self._callback(brick)
            self._last_close = brick_close
            diff = bar.close - self._last_close

        return new_bricks

    @property
    def history(self) -> list[ConsolidatedBar]:
        return list(self._completed)


class RangeConsolidator:
    """Range bars : new bar when price range reaches threshold."""

    def __init__(self, range_size: float, callback: Callable[[ConsolidatedBar], None] | None = None):
        self.range_size = range_size
        self._callback = callback
        self._current: ConsolidatedBar | None = None
        self._completed: list[ConsolidatedBar] = []

    def update(self, bar: BarData) -> ConsolidatedBar | None:
        if self._current is None:
            self._current = ConsolidatedBar(
                symbol=bar.symbol, start_time=bar.timestamp, end_time=bar.timestamp,
                open=bar.open, high=bar.high, low=bar.low, close=bar.close,
                volume=bar.volume, bar_count=1,
            )
            return None

        new_high = max(self._current.high, bar.high)
        new_low = min(self._current.low, bar.low)

        if new_high - new_low >= self.range_size:
            completed = self._current
            completed.close = bar.close
            completed.end_time = bar.timestamp
            self._completed.append(completed)
            if self._callback:
                self._callback(completed)
            self._current = ConsolidatedBar(
                symbol=bar.symbol, start_time=bar.timestamp, end_time=bar.timestamp,
                open=bar.close, high=bar.close, low=bar.close, close=bar.close,
                volume=0, bar_count=0,
            )
            return completed

        self._current.high = new_high
        self._current.low = new_low
        self._current.close = bar.close
        self._current.volume += bar.volume
        self._current.bar_count += 1
        self._current.end_time = bar.timestamp
        return None

    @property
    def history(self) -> list[ConsolidatedBar]:
        return list(self._completed)
