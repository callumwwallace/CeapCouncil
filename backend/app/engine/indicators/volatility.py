"""Volatility indicators."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from app.engine.indicators.base import Indicator, MultiInputIndicator


class ATR(MultiInputIndicator):
    """Average True Range."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or close is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        if len(c) < 2:
            return np.nan
        tr = np.maximum(h[1:] - l[1:], np.abs(h[1:] - c[:-1]))
        tr = np.maximum(tr, np.abs(l[1:] - c[:-1]))
        if len(tr) < self.period:
            return float(np.mean(tr))
        return float(np.mean(tr[-self.period:]))

    def series(
        self,
        high: Sequence[float] | np.ndarray,
        low: Sequence[float] | np.ndarray,
        close: Sequence[float] | np.ndarray,
    ) -> np.ndarray:
        """Return full ATR series."""
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        n = len(c)
        out = np.full(n, np.nan)
        if n < 2:
            return out
        tr = np.maximum(h[1:] - l[1:], np.abs(h[1:] - c[:-1]))
        tr = np.maximum(tr, np.abs(l[1:] - c[:-1]))
        for i in range(self.period, len(tr) + 1):
            out[i] = np.mean(tr[i - self.period:i])
        return out


class NormalizedATR(MultiInputIndicator):
    """Normalized ATR (ATR / Close * 100)."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period
        self._atr = ATR(period)

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        atr_val = self._atr(high=high, low=low, close=close)
        if np.isnan(atr_val):
            return np.nan
        c = self._to_array(close)
        if c[-1] == 0:
            return np.nan
        return float(atr_val / c[-1] * 100)


class HistoricalVolatility(Indicator):
    """Annualized historical volatility from log returns."""

    def __init__(self, period: int = 20, annualize: int = 252):
        super().__init__(period=period, annualize=annualize)
        self.period = period
        self.annualize = annualize

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.period + 1:
            return np.nan
        log_returns = np.log(arr[1:] / arr[:-1])
        window = log_returns[-self.period:]
        return float(np.std(window, ddof=1) * np.sqrt(self.annualize) * 100)


class GarmanKlass(MultiInputIndicator):
    """Garman-Klass volatility estimator: uses OHLC for better estimation."""

    def __init__(self, period: int = 20, annualize: int = 252):
        super().__init__(period=period, annualize=annualize)
        self.period = period
        self.annualize = annualize

    def __call__(
        self,
        open: Sequence[float] | np.ndarray | None = None,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if open is None or high is None or low is None or close is None:
            return np.nan
        o = self._to_array(open)
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        if len(c) < self.period:
            return np.nan
        log_hl = np.log(h[-self.period:] / l[-self.period:])
        log_co = np.log(c[-self.period:] / o[-self.period:])
        gk = 0.5 * log_hl ** 2 - (2 * np.log(2) - 1) * log_co ** 2
        return float(np.sqrt(np.mean(gk) * self.annualize) * 100)
