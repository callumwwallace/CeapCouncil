"""Oscillator indicators : plotted in a separate pane."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from app.engine.indicators.base import Indicator, MultiInputIndicator
from app.engine.indicators.overlays import EMA


class RSI(Indicator):
    """Relative Strength Index."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.period + 1:
            return np.nan
        deltas = np.diff(arr)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)
        avg_gain = float(np.mean(gains[-self.period:]))
        avg_loss = float(np.mean(losses[-self.period:]))
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return float(100 - 100 / (1 + rs))

    def series(self, data: Sequence[float] | np.ndarray) -> np.ndarray:
        arr = self._to_array(data)
        n = len(arr)
        out = np.full(n, np.nan)
        if n < self.period + 1:
            return out
        deltas = np.diff(arr)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)
        avg_gain = np.mean(gains[:self.period])
        avg_loss = np.mean(losses[:self.period])
        if avg_loss > 0:
            out[self.period] = 100 - 100 / (1 + avg_gain / avg_loss)
        else:
            out[self.period] = 100.0
        for i in range(self.period, len(deltas)):
            avg_gain = (avg_gain * (self.period - 1) + gains[i]) / self.period
            avg_loss = (avg_loss * (self.period - 1) + losses[i]) / self.period
            if avg_loss > 0:
                out[i + 1] = 100 - 100 / (1 + avg_gain / avg_loss)
            else:
                out[i + 1] = 100.0
        return out


class MACD(Indicator):
    """Moving Average Convergence Divergence."""

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        super().__init__(fast=fast, slow=slow, signal=signal)
        self.fast_period = fast
        self.slow_period = slow
        self.signal_period = signal

    def __call__(self, data: Sequence[float] | np.ndarray) -> dict:
        arr = self._to_array(data)
        if len(arr) < self.slow_period:
            return {"macd": np.nan, "signal": np.nan, "histogram": np.nan}
        fast_ema = EMA(self.fast_period).series(arr)
        slow_ema = EMA(self.slow_period).series(arr)
        macd_line = fast_ema - slow_ema
        valid_macd = macd_line[~np.isnan(macd_line)]
        if len(valid_macd) < self.signal_period:
            return {"macd": float(valid_macd[-1]) if len(valid_macd) > 0 else np.nan, "signal": np.nan, "histogram": np.nan}
        signal_ema = EMA(self.signal_period)
        signal_val = signal_ema(valid_macd)
        macd_val = float(valid_macd[-1])
        return {
            "macd": macd_val,
            "signal": signal_val,
            "histogram": macd_val - signal_val if not np.isnan(signal_val) else np.nan,
        }


class Stochastic(MultiInputIndicator):
    """Stochastic Oscillator : %K, %D."""

    def __init__(self, k_period: int = 14, d_period: int = 3, smooth: int = 3):
        super().__init__(k_period=k_period, d_period=d_period, smooth=smooth)
        self.k_period = k_period
        self.d_period = d_period
        self.smooth = smooth

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None or close is None:
            return {"k": np.nan, "d": np.nan}
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        n = len(c)
        if n < self.k_period:
            return {"k": np.nan, "d": np.nan}
        raw_k = np.full(n, np.nan)
        for i in range(self.k_period - 1, n):
            hh = np.max(h[i - self.k_period + 1: i + 1])
            ll = np.min(l[i - self.k_period + 1: i + 1])
            if hh - ll > 0:
                raw_k[i] = (c[i] - ll) / (hh - ll) * 100
            else:
                raw_k[i] = 50.0
        valid_k = raw_k[~np.isnan(raw_k)]
        if len(valid_k) < self.smooth:
            return {"k": float(valid_k[-1]) if len(valid_k) > 0 else np.nan, "d": np.nan}
        smoothed_k = float(np.mean(valid_k[-self.smooth:]))
        d_val = float(np.mean(valid_k[-self.d_period:])) if len(valid_k) >= self.d_period else np.nan
        return {"k": smoothed_k, "d": d_val}


class CCI(MultiInputIndicator):
    """Commodity Channel Index."""

    def __init__(self, period: int = 20, constant: float = 0.015):
        super().__init__(period=period)
        self.period = period
        self.constant = constant

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
        if len(c) < self.period:
            return np.nan
        tp = (h + l + c) / 3.0
        window = tp[-self.period:]
        mean_tp = np.mean(window)
        mad = np.mean(np.abs(window - mean_tp))
        if mad == 0:
            return 0.0
        return float((tp[-1] - mean_tp) / (self.constant * mad))


class WilliamsR(MultiInputIndicator):
    """Williams %R."""

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
        if len(c) < self.period:
            return np.nan
        hh = np.max(h[-self.period:])
        ll = np.min(l[-self.period:])
        if hh - ll == 0:
            return -50.0
        return float((hh - c[-1]) / (hh - ll) * -100)


class ROC(Indicator):
    """Rate of Change (percentage)."""

    def __init__(self, period: int = 12):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) <= self.period:
            return np.nan
        prev = arr[-self.period - 1]
        if prev == 0:
            return 0.0
        return float((arr[-1] - prev) / prev * 100)


class MOM(Indicator):
    """Momentum : simple price difference over N periods."""

    def __init__(self, period: int = 10):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) <= self.period:
            return np.nan
        return float(arr[-1] - arr[-self.period - 1])


class PPO(Indicator):
    """Percentage Price Oscillator : MACD as percentage of slow EMA."""

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        super().__init__(fast=fast, slow=slow, signal=signal)
        self.fast_period = fast
        self.slow_period = slow
        self.signal_period = signal

    def __call__(self, data: Sequence[float] | np.ndarray) -> dict:
        arr = self._to_array(data)
        if len(arr) < self.slow_period:
            return {"ppo": np.nan, "signal": np.nan, "histogram": np.nan}
        fast_ema = EMA(self.fast_period)(arr)
        slow_ema = EMA(self.slow_period)(arr)
        if np.isnan(slow_ema) or slow_ema == 0:
            return {"ppo": np.nan, "signal": np.nan, "histogram": np.nan}
        ppo_val = (fast_ema - slow_ema) / slow_ema * 100
        return {"ppo": ppo_val, "signal": np.nan, "histogram": np.nan}


class TSI(Indicator):
    """True Strength Index."""

    def __init__(self, long_period: int = 25, short_period: int = 13):
        super().__init__(long_period=long_period, short_period=short_period)
        self.long_period = long_period
        self.short_period = short_period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.long_period + self.short_period:
            return np.nan
        deltas = np.diff(arr)
        abs_deltas = np.abs(deltas)
        ema_long = EMA(self.long_period)
        ema_short = EMA(self.short_period)
        double_smoothed = ema_short(ema_long.series(deltas)[~np.isnan(ema_long.series(deltas))])
        double_smoothed_abs = ema_short(ema_long.series(abs_deltas)[~np.isnan(ema_long.series(abs_deltas))])
        if np.isnan(double_smoothed_abs) or double_smoothed_abs == 0:
            return 0.0
        return float(double_smoothed / double_smoothed_abs * 100)


class UltimateOscillator(MultiInputIndicator):
    """Ultimate Oscillator : Williams' multi-timeframe oscillator."""

    def __init__(self, period1: int = 7, period2: int = 14, period3: int = 28):
        super().__init__(period1=period1, period2=period2, period3=period3)
        self.p1 = period1
        self.p2 = period2
        self.p3 = period3

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
        n = len(c)
        if n < self.p3 + 1:
            return np.nan
        bp = c[1:] - np.minimum(l[1:], c[:-1])
        tr = np.maximum(h[1:], c[:-1]) - np.minimum(l[1:], c[:-1])
        tr = np.where(tr == 0, 1e-10, tr)
        avg1 = np.sum(bp[-self.p1:]) / np.sum(tr[-self.p1:])
        avg2 = np.sum(bp[-self.p2:]) / np.sum(tr[-self.p2:])
        avg3 = np.sum(bp[-self.p3:]) / np.sum(tr[-self.p3:])
        return float((4 * avg1 + 2 * avg2 + avg3) / 7 * 100)


class Aroon(MultiInputIndicator):
    """Aroon indicator : measures trend strength via time since high/low."""

    def __init__(self, period: int = 25):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None:
            return {"up": np.nan, "down": np.nan, "oscillator": np.nan}
        h = self._to_array(high)
        l = self._to_array(low)
        if len(h) < self.period + 1:
            return {"up": np.nan, "down": np.nan, "oscillator": np.nan}
        window_h = h[-self.period - 1:]
        window_l = l[-self.period - 1:]
        days_since_high = self.period - int(np.argmax(window_h))
        days_since_low = self.period - int(np.argmin(window_l))
        aroon_up = (self.period - days_since_high) / self.period * 100
        aroon_down = (self.period - days_since_low) / self.period * 100
        return {"up": aroon_up, "down": aroon_down, "oscillator": aroon_up - aroon_down}


class ADX(MultiInputIndicator):
    """Average Directional Index : trend strength."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None or close is None:
            return {"adx": np.nan, "plus_di": np.nan, "minus_di": np.nan}
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        n = len(c)
        if n < self.period * 2:
            return {"adx": np.nan, "plus_di": np.nan, "minus_di": np.nan}
        tr = np.maximum(h[1:] - l[1:], np.abs(h[1:] - c[:-1]))
        tr = np.maximum(tr, np.abs(l[1:] - c[:-1]))
        plus_dm = np.where((h[1:] - h[:-1]) > (l[:-1] - l[1:]), np.maximum(h[1:] - h[:-1], 0), 0)
        minus_dm = np.where((l[:-1] - l[1:]) > (h[1:] - h[:-1]), np.maximum(l[:-1] - l[1:], 0), 0)
        atr = np.mean(tr[-self.period:])
        if atr == 0:
            return {"adx": 0.0, "plus_di": 0.0, "minus_di": 0.0}
        plus_di = np.mean(plus_dm[-self.period:]) / atr * 100
        minus_di = np.mean(minus_dm[-self.period:]) / atr * 100
        dx_sum = plus_di + minus_di
        if dx_sum == 0:
            return {"adx": 0.0, "plus_di": plus_di, "minus_di": minus_di}
        dx = abs(plus_di - minus_di) / dx_sum * 100
        return {"adx": float(dx), "plus_di": float(plus_di), "minus_di": float(minus_di)}
