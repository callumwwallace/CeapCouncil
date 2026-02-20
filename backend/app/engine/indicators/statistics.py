"""Statistical indicators."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from app.engine.indicators.base import Indicator


class StdDev(Indicator):
    """Standard Deviation over a rolling window."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return np.nan
        return float(np.std(arr[-self.period:], ddof=1))


class LinearRegression(Indicator):
    """Linear Regression — returns slope, intercept, r_squared, forecast."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> dict:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return {"slope": np.nan, "intercept": np.nan, "r_squared": np.nan, "forecast": np.nan}
        window = arr[-self.period:]
        x = np.arange(self.period, dtype=np.float64)
        x_mean = np.mean(x)
        y_mean = np.mean(window)
        ss_xy = np.sum((x - x_mean) * (window - y_mean))
        ss_xx = np.sum((x - x_mean) ** 2)
        ss_yy = np.sum((window - y_mean) ** 2)
        if ss_xx == 0:
            return {"slope": 0.0, "intercept": y_mean, "r_squared": 0.0, "forecast": y_mean}
        slope = float(ss_xy / ss_xx)
        intercept = float(y_mean - slope * x_mean)
        r_squared = float((ss_xy ** 2) / (ss_xx * ss_yy)) if ss_yy > 0 else 0.0
        forecast = intercept + slope * self.period
        return {"slope": slope, "intercept": intercept, "r_squared": r_squared, "forecast": forecast}


class Correlation(Indicator):
    """Pearson Correlation between two series."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray, other: Sequence[float] | np.ndarray | None = None) -> float:
        if other is None:
            return np.nan
        arr1 = self._to_array(data)
        arr2 = self._to_array(other)
        n = min(len(arr1), len(arr2), self.period)
        if n < 3:
            return np.nan
        a = arr1[-n:]
        b = arr2[-n:]
        corr = np.corrcoef(a, b)
        return float(corr[0, 1])


class ZScore(Indicator):
    """Z-Score — how many standard deviations from the mean."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return np.nan
        window = arr[-self.period:]
        mean = np.mean(window)
        std = np.std(window, ddof=1)
        if std == 0:
            return 0.0
        return float((arr[-1] - mean) / std)


class HurstExponent(Indicator):
    """Hurst Exponent — measures trend persistence.

    H > 0.5: trending, H < 0.5: mean-reverting, H ≈ 0.5: random walk.
    """

    def __init__(self, max_lag: int = 20):
        super().__init__(max_lag=max_lag)
        self.max_lag = max_lag

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.max_lag * 2:
            return np.nan
        lags = range(2, self.max_lag + 1)
        tau = []
        for lag in lags:
            diffs = arr[lag:] - arr[:-lag]
            std = np.std(diffs)
            if std > 0:
                tau.append(std)
            else:
                tau.append(1e-10)
        log_lags = np.log(list(lags))
        log_tau = np.log(tau)
        if len(log_lags) < 2:
            return np.nan
        poly = np.polyfit(log_lags, log_tau, 1)
        return float(poly[0])
