"""Simulation clock: advances time based on events in the queue.

In backtest mode, the clock jumps to the next event's timestamp.
In live/paper mode, the clock follows wall-clock time.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum


class ClockMode(Enum):
    BACKTEST = "backtest"
    PAPER = "paper"
    LIVE = "live"


class SimulationClock:
    """Manages simulation time for the engine."""

    def __init__(self, mode: ClockMode = ClockMode.BACKTEST):
        self.mode = mode
        self._current_time: datetime | None = None
        self._start_time: datetime | None = None
        self._end_time: datetime | None = None
        self._bar_count: int = 0

    @property
    def now(self) -> datetime:
        if self.mode == ClockMode.BACKTEST:
            if self._current_time is None:
                raise RuntimeError("Clock not initialized: call advance() first")
            return self._current_time
        return datetime.now(timezone.utc)

    @property
    def bar_count(self) -> int:
        return self._bar_count

    def set_range(self, start: datetime, end: datetime) -> None:
        self._start_time = start
        self._end_time = end
        self._current_time = start

    def advance(self, to: datetime) -> None:
        """Advance clock to a new timestamp (must be >= current)."""
        if self._current_time is not None and to < self._current_time:
            raise ValueError(
                f"Cannot go back in time: {to} < {self._current_time}"
            )
        self._current_time = to
        self._bar_count += 1

    def is_within_range(self, dt: datetime) -> bool:
        if self._start_time and dt < self._start_time:
            return False
        if self._end_time and dt > self._end_time:
            return False
        return True

    def reset(self) -> None:
        self._current_time = self._start_time
        self._bar_count = 0
